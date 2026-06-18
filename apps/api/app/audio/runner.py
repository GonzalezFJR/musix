"""Ejecución de un AudioJob: ingesta del input → engine → guardar artefactos.

Lo usa el worker (cola) y el endpoint de ejecución síncrona (dev/tests). Es
idempotente respecto al estado: deja el job en `done` o `error`.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

from ..models import AudioJob, utcnow
from ..storage import audio_output_key, get_storage
from .engines import get_engine

logger = logging.getLogger(__name__)


def _ext_of(name: str) -> str:
    ext = os.path.splitext(name or "")[1].lower()
    return ext if ext else ".bin"


def _ingest(job: AudioJob, work: Path) -> Path:
    """Materializa el audio de entrada en un fichero local dentro de `work`."""
    if job.source_kind == "youtube":
        return _ingest_youtube(job.source_ref, work)
    # upload: el input ya está en storage en source_ref.
    data = get_storage().get(job.source_ref)
    path = work / f"input{_ext_of(job.input_filename or job.source_ref)}"
    path.write_bytes(data)
    return path


def _ingest_youtube(url: str, work: Path) -> Path:
    """Descarga el audio de un enlace con yt-dlp (opcional)."""
    try:
        import yt_dlp  # noqa: F401
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("yt-dlp no está instalado en este worker") from exc
    import yt_dlp

    out_tmpl = str(work / "input.%(ext)s")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": out_tmpl,
        "noplaylist": True,
        "quiet": True,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    files = list(work.glob("input.*"))
    if not files:
        raise RuntimeError("yt-dlp no produjo ningún fichero de audio")
    return files[0]


def run_job(job: AudioJob, repos) -> AudioJob:
    engine = get_engine(job.engine)
    if engine is None:
        job.status = "error"
        job.error = f"Engine desconocido: {job.engine}"
        job.updated_at = utcnow()
        return repos.jobs.update(job)
    if not engine.available():
        job.status = "error"
        job.error = f"Engine '{job.engine}' no disponible (faltan dependencias)"
        job.updated_at = utcnow()
        return repos.jobs.update(job)

    try:
        with tempfile.TemporaryDirectory(prefix=f"job-{job.id}-") as tmp:
            work = Path(tmp)
            out_dir = work / "out"
            out_dir.mkdir()
            input_path = _ingest(job, work)

            result = engine.run(input_path, job.params or {}, out_dir)

            storage = get_storage()
            outputs = []
            for spec in result.outputs:
                src = out_dir / spec.name
                if not src.exists():
                    continue
                key = audio_output_key(job.owner_id, job.id, spec.name)
                storage.put(key, src.read_bytes())
                outputs.append({"name": spec.name, "key": key, "kind": spec.kind, "meta": spec.meta})

            job.outputs = outputs
            job.result = result.result
            job.logs = result.logs
            job.status = "done"
    except Exception as exc:  # noqa: BLE001 — cualquier fallo del engine → job en error
        logger.exception("Fallo ejecutando job %s (engine=%s)", job.id, job.engine)
        job.status = "error"
        job.error = str(exc)

    job.updated_at = utcnow()
    return repos.jobs.update(job)
