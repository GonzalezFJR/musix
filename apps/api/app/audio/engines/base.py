"""Interfaz uniforme de engines de audio.

Un engine recibe un fichero de audio de entrada y produce artefactos (análisis,
stems, MIDI…). Todos implementan la misma interfaz para que el orquestador y el
worker los traten igual y se puedan comparar tecnologías sin tocar el pipeline.

Convención de salida: el engine escribe sus artefactos en `out_dir` (un directorio
temporal local) y devuelve descriptores `OutputSpec` que referencian esos ficheros
por nombre. El runner los sube al almacenamiento.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Tipos de engine (== AudioJob.kind).
ANALYSIS = "analysis"
SEPARATION = "separation"
TRANSCRIPTION = "transcription"


@dataclass
class OutputSpec:
    name: str  # nombre de fichero en out_dir (y clave relativa en storage)
    kind: str  # "audio" | "midi" | "json" | "image" | …
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class EngineResult:
    outputs: list[OutputSpec] = field(default_factory=list)
    result: dict[str, Any] = field(default_factory=dict)  # resumen estructurado
    logs: str = ""


class Engine:
    """Clase base. Subclases definen id/kind/label y `run()`."""

    id: str = ""
    kind: str = ANALYSIS
    label: str = ""
    needs_gpu: bool = False

    def available(self) -> bool:
        """True si el engine puede ejecutarse (deps/binari­os presentes)."""
        return True

    def params_schema(self) -> dict:
        """JSON-Schema-lite de los parámetros aceptados (para UI y tools de LLM)."""
        return {}

    def describe(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "label": self.label or self.id,
            "needs_gpu": self.needs_gpu,
            "available": self.available(),
            "params_schema": self.params_schema(),
        }

    def run(self, input_path: Path, params: dict, out_dir: Path) -> EngineResult:
        raise NotImplementedError
