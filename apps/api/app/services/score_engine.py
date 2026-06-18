"""Wrapper del sidecar score-engine (Node + AlphaTab).

AlphaTab (JS) es la fuente de verdad para crear/validar/editar el `.mu6`. Aquí lo
invocamos como subprocess (un proceso por operación, sin estado): le pasamos un
objeto JSON por stdin y recibimos un objeto JSON por stdout.

El `.mu6` es el JSON de AlphaTab (objeto). La "IR" es la vista plana y estable
pensada para el LLM (ver docs/SCORE-API.md).
"""

from __future__ import annotations

import json
import subprocess
from functools import lru_cache
from typing import Any, Optional

from ..config import get_settings


class ScoreEngineError(RuntimeError):
    """Error de validación/edición devuelto por el sidecar (mensaje legible)."""


class ScoreEngineUnavailable(RuntimeError):
    """El sidecar no se pudo ejecutar (Node ausente, ruta inválida, timeout)."""


@lru_cache
def _entry() -> tuple[str, str]:
    s = get_settings()
    return s.node_bin, str(s.score_engine_dir / "src" / "index.mjs")


def _run(command: str, payload: dict[str, Any], *, timeout: float = 30.0) -> dict:
    node_bin, entry = _entry()
    try:
        proc = subprocess.run(
            [node_bin, entry, command],
            input=json.dumps(payload).encode(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise ScoreEngineUnavailable(f"No se encontró Node ('{node_bin}')") from exc
    except subprocess.TimeoutExpired as exc:
        raise ScoreEngineUnavailable("El sidecar score-engine excedió el tiempo límite") from exc

    if proc.returncode != 0 and not proc.stdout:
        raise ScoreEngineUnavailable(
            f"score-engine falló (code {proc.returncode}): {proc.stderr.decode(errors='replace')[:500]}"
        )
    try:
        data = json.loads(proc.stdout.decode())
    except (ValueError, UnicodeDecodeError) as exc:
        raise ScoreEngineUnavailable(
            f"Salida no-JSON del sidecar: {proc.stdout[:300]!r} / {proc.stderr.decode(errors='replace')[:300]}"
        ) from exc

    if not data.get("ok"):
        raise ScoreEngineError(data.get("error") or "Error desconocido en score-engine")
    return data


# ── API de alto nivel ────────────────────────────────────────────
def new_score(meta: Optional[dict] = None) -> dict:
    """Crea una partitura mínima válida. Devuelve {score, ir}."""
    return _run("new", {"meta": meta or {}})


def validate(score: dict) -> dict:
    """Valida/normaliza un `.mu6`. Devuelve {score (normalizado), ir} o lanza ScoreEngineError."""
    return _run("validate", {"score": score})


def to_ir(score: dict) -> dict:
    """Convierte un `.mu6` a la IR (vista de lectura). Devuelve {ir}."""
    return _run("to-ir", {"score": score})


def apply(score: Optional[dict], ops: list[dict], meta: Optional[dict] = None) -> dict:
    """Aplica operaciones de mutación. Si score es None, parte de una nueva.
    Devuelve {results, score, ir}."""
    payload: dict[str, Any] = {"ops": ops}
    if score is not None:
        payload["score"] = score
    if meta:
        payload["meta"] = meta
    return _run("apply", payload)


def available() -> bool:
    """True si el sidecar responde (para /api/score/health y diagnósticos)."""
    try:
        _run("ops", {})
        return True
    except (ScoreEngineError, ScoreEngineUnavailable):
        return False
