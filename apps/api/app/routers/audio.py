"""Audio Lab — orquestador de jobs de audio (análisis / separación / transcripción).

Crea jobs asíncronos (estado `queued`) que un worker ejecuta con el engine elegido.
El audio de entrada (upload o YouTube) y los artefactos de salida viven en el
almacenamiento; aquí se exponen para subir, listar, consultar y descargar.
"""

from __future__ import annotations

import json
import os

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status

from ..audio.engines import engine_ids, get_engine, list_engines
from ..audio.runner import run_job
from ..deps import CurrentUser, Repos
from ..models import AudioJob, utcnow
from ..schemas import AudioEngineInfo, AudioJobList, AudioJobRead
from ..storage import audio_input_key, audio_prefix, get_storage

router = APIRouter(prefix="/api/audio", tags=["audio"])

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
AUDIO_EXTS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".opus", ".aac", ".aiff", ".wma"}


def _to_read(job: AudioJob) -> AudioJobRead:
    return AudioJobRead(
        id=job.id, kind=job.kind, engine=job.engine, status=job.status,
        source_kind=job.source_kind, input_filename=job.input_filename,
        params=job.params, result=job.result, error=job.error,
        outputs=[{"name": o["name"], "kind": o.get("kind", ""), "meta": o.get("meta", {})} for o in job.outputs],
        created_at=job.created_at, updated_at=job.updated_at,
    )


def _owned(job_id: str, user_id: str, repos) -> AudioJob:
    job = repos.jobs.get_owned(job_id, user_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job no encontrado")
    return job


@router.get("/engines", response_model=list[AudioEngineInfo])
def get_engines() -> list[dict]:
    return list_engines()


@router.post("/jobs", response_model=AudioJobRead, status_code=status.HTTP_201_CREATED)
async def create_job(
    user: CurrentUser,
    repos: Repos,
    kind: str = Form(...),
    engine: str = Form(...),
    params: str = Form("{}"),
    file: UploadFile | None = File(None),
    youtube_url: str | None = Form(None),
) -> AudioJobRead:
    eng = get_engine(engine)
    if eng is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Engine desconocido: {engine}. Opciones: {engine_ids()}")
    if eng.kind != kind:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"El engine '{engine}' es de tipo '{eng.kind}', no '{kind}'")
    try:
        parsed_params = json.loads(params or "{}")
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "params no es JSON válido")

    job = AudioJob(owner_id=user.id, kind=kind, engine=engine, params=parsed_params)

    if file is not None:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in AUDIO_EXTS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Formato de audio no soportado: {ext or '?'}")
        data = await file.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "El audio supera el tamaño máximo (100 MB)")
        key = audio_input_key(user.id, job.id, ext)
        get_storage().put(key, data)
        job.source_kind = "upload"
        job.source_ref = key
        job.input_filename = file.filename or f"input{ext}"
    elif youtube_url:
        job.source_kind = "youtube"
        job.source_ref = youtube_url.strip()
        job.input_filename = youtube_url.strip()
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta el audio: sube un fichero o indica youtube_url")

    repos.jobs.create(job)
    return _to_read(job)


@router.get("/jobs", response_model=AudioJobList)
def list_jobs(user: CurrentUser, repos: Repos, cursor: str | None = None, limit: int = 50) -> AudioJobList:
    jobs, next_cursor = repos.jobs.list_for_owner(user.id, limit=min(limit, 100), cursor=cursor)
    return AudioJobList(jobs=[_to_read(j) for j in jobs], next_cursor=next_cursor)


@router.get("/jobs/{job_id}", response_model=AudioJobRead)
def get_job(job_id: str, user: CurrentUser, repos: Repos) -> AudioJobRead:
    return _to_read(_owned(job_id, user.id, repos))


@router.post("/jobs/{job_id}/run", response_model=AudioJobRead)
def run_now(job_id: str, user: CurrentUser, repos: Repos) -> AudioJobRead:
    """Ejecuta el job de forma síncrona (útil en dev sin worker, y en tests)."""
    job = _owned(job_id, user.id, repos)
    if job.status == "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "El job ya se está ejecutando")
    if job.status == "done":
        return _to_read(job)
    return _to_read(run_job(job, repos))


@router.get("/jobs/{job_id}/outputs/{name}")
def download_output(job_id: str, name: str, user: CurrentUser, repos: Repos) -> Response:
    job = _owned(job_id, user.id, repos)
    output = next((o for o in job.outputs if o["name"] == name), None)
    if output is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Artefacto no encontrado")
    try:
        data = get_storage().get(output["key"])
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Artefacto no encontrado en el almacenamiento")
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: str, user: CurrentUser, repos: Repos) -> None:
    job = _owned(job_id, user.id, repos)
    get_storage().delete_prefix(audio_prefix(user.id, job.id))
    repos.jobs.delete(job)
