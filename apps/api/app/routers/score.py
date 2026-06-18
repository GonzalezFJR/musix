"""Score API — edición programática de partituras (orientada a uso por un LLM).

La partitura canónica de un proyecto se guarda como `.mu6` (JSON de AlphaTab) en el
almacenamiento. Toda mutación pasa por el sidecar `score-engine` (AlphaTab = fuente
de verdad): si AlphaTab no lo acepta, se devuelve 400 y no se persiste nada.

El editor del frontend consume el mismo `.mu6` vía `GET /api/projects/{id}`, así que
los cambios hechos por esta API se ven al abrir el proyecto.

Concurrencia: bloqueo optimista por **ETag de contenido** (hash del `.mu6`). Envía
`expected_etag` en las mutaciones para evitar pisar cambios concurrentes (→ 409).
"""

from __future__ import annotations

import hashlib
import json
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUser, Repos
from ..models import Project, utcnow
from ..schemas import (
    ScoreNewRequest,
    ScoreOpsRequest,
    ScoreOpsResponse,
    ScoreReadResponse,
)
from ..services import score_engine as se
from ..storage import get_storage, score_key

router = APIRouter(prefix="/api/score", tags=["score"])


def _owned(project_id: str, user_id: str, repos) -> Project:
    project = repos.projects.get_owned(project_id, user_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proyecto no encontrado")
    return project


def _etag(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()[:16]


def _load_raw(project: Project) -> Optional[bytes]:
    if not project.has_score:
        return None
    try:
        return get_storage().get(score_key(project.owner_id, project.id))
    except FileNotFoundError:
        return None


def _store(project: Project, score: dict, repos) -> str:
    # Serialización canónica (claves ordenadas) → ETag estable.
    raw = json.dumps(score, sort_keys=True, separators=(",", ":")).encode()
    get_storage().put(score_key(project.owner_id, project.id), raw)
    if not project.has_score:
        project.has_score = True
    project.updated_at = utcnow()
    repos.projects.update(project)
    return _etag(raw)


def _engine_call(fn, *args, **kwargs):
    """Traduce errores del sidecar a respuestas HTTP."""
    try:
        return fn(*args, **kwargs)
    except se.ScoreEngineError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Partitura no válida: {exc}") from exc
    except se.ScoreEngineUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"score-engine no disponible: {exc}") from exc


@router.get("/ops")
def list_ops() -> dict:
    """Lista de operaciones soportadas (útil para descubrir la API / tools de LLM)."""
    data = _engine_call(se._run, "ops", {})  # noqa: SLF001 — uso interno controlado
    return {"ops": data.get("ops", [])}


@router.get("/health")
def health() -> dict:
    return {"available": se.available()}


@router.get("/{project_id}", response_model=ScoreReadResponse)
def get_score(project_id: str, user: CurrentUser, repos: Repos) -> ScoreReadResponse:
    """Devuelve la IR (vista de lectura) y el ETag actual de la partitura."""
    project = _owned(project_id, user.id, repos)
    raw = _load_raw(project)
    if raw is None:
        return ScoreReadResponse(has_score=False)
    ir = _engine_call(se.to_ir, json.loads(raw))["ir"]
    return ScoreReadResponse(has_score=True, etag=_etag(raw), ir=ir)


@router.post("/{project_id}/new", response_model=ScoreOpsResponse, status_code=status.HTTP_201_CREATED)
def new_score(project_id: str, data: ScoreNewRequest, user: CurrentUser, repos: Repos) -> ScoreOpsResponse:
    """Crea una partitura mínima válida en el proyecto (1 pista, 1 compás 4/4)."""
    project = _owned(project_id, user.id, repos)
    if project.has_score and not data.force:
        raise HTTPException(status.HTTP_409_CONFLICT, "El proyecto ya tiene partitura (usa force=true)")
    result = _engine_call(se.new_score, data.meta or {})
    etag = _store(project, result["score"], repos)
    return ScoreOpsResponse(etag=etag, ir=result["ir"], results=[])


@router.post("/{project_id}/ops", response_model=ScoreOpsResponse)
def apply_ops(project_id: str, data: ScoreOpsRequest, user: CurrentUser, repos: Repos) -> ScoreOpsResponse:
    """Aplica un lote atómico de operaciones de edición y persiste el resultado."""
    project = _owned(project_id, user.id, repos)
    raw = _load_raw(project)
    current_etag = _etag(raw) if raw is not None else None

    # Bloqueo optimista.
    if data.expected_etag is not None and data.expected_etag != current_etag:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"ETag desfasado (actual={current_etag}); recarga la partitura antes de editar",
        )

    score = json.loads(raw) if raw is not None else None
    result = _engine_call(se.apply, score, data.ops, data.meta)
    etag = _store(project, result["score"], repos)
    return ScoreOpsResponse(etag=etag, ir=result["ir"], results=result.get("results", []))
