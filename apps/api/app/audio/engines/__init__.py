"""Registro de engines de audio.

Cada engine se registra aquí por su id. El orquestador expone el catálogo
(`describe()`) y el worker resuelve el engine de un job por su id. Añadir una
tecnología nueva (librosa, demucs, basic-pitch…) = crear su módulo y registrarlo.
"""

from __future__ import annotations

from typing import Optional

from .base import Engine
from .probe import ProbeEngine


def _build_registry() -> dict[str, Engine]:
    engines: list[Engine] = [ProbeEngine()]
    # Engines opcionales (se importan de forma perezosa; si faltan sus deps, no se
    # registran y simplemente no aparecen como disponibles).
    # Fases 3–5: librosa, essentia, demucs, audio-separator, basic-pitch, …
    return {e.id: e for e in engines}


_REGISTRY: dict[str, Engine] = _build_registry()


def get_engine(engine_id: str) -> Optional[Engine]:
    return _REGISTRY.get(engine_id)


def list_engines() -> list[dict]:
    return [e.describe() for e in _REGISTRY.values()]


def engine_ids() -> list[str]:
    return list(_REGISTRY.keys())
