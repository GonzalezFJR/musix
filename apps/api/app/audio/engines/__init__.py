"""Registro de engines de audio.

Cada engine se registra aquí por su id. El orquestador expone el catálogo
(`describe()`) y el worker resuelve el engine de un job por su id. Añadir una
tecnología nueva (librosa, demucs, basic-pitch…) = crear su módulo y registrarlo.
"""

from __future__ import annotations

from typing import Optional

from .audio_separator_engine import AudioSeparatorEngine
from .base import Engine
from .basic_pitch_engine import BasicPitchEngine
from .demucs_engine import DemucsEngine
from .essentia_engine import EssentiaEngine
from .librosa_engine import LibrosaEngine
from .probe import ProbeEngine


def _build_registry() -> dict[str, Engine]:
    # Los engines se instancian siempre (barato); sus dependencias pesadas se
    # importan de forma perezosa en run(). `available()` (vía find_spec) refleja si
    # están instaladas, así que un engine sin deps aparece como "no disponible".
    # Pesados/GPU (YourMT3, MT3, Omnizart, SheetSage): contenedores aislados,
    # diferidos a disponibilidad de GPU (ver docs/AUDIO-ENGINES.md).
    engines: list[Engine] = [
        ProbeEngine(),
        LibrosaEngine(),
        EssentiaEngine(),
        DemucsEngine(),
        AudioSeparatorEngine(),
        BasicPitchEngine(),
    ]
    return {e.id: e for e in engines}


_REGISTRY: dict[str, Engine] = _build_registry()


def get_engine(engine_id: str) -> Optional[Engine]:
    return _REGISTRY.get(engine_id)


def list_engines() -> list[dict]:
    return [e.describe() for e in _REGISTRY.values()]


def engine_ids() -> list[str]:
    return list(_REGISTRY.keys())
