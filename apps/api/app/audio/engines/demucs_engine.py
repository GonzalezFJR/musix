"""Engine de separación de pistas con Demucs (Meta).

Separa el audio en stems (voz, batería, bajo, otros). Funciona en CPU (lento) y
usa GPU si está disponible. Se invoca por CLI (`python -m demucs`) para ser robusto
entre versiones. Dependencia pesada (torch): import perezoso + gating por find_spec.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

from .base import SEPARATION, Engine, EngineResult, OutputSpec


class DemucsEngine(Engine):
    id = "demucs"
    kind = SEPARATION
    label = "Demucs (htdemucs)"
    needs_gpu = False  # funciona en CPU (lento); usa GPU si la hay

    def available(self) -> bool:
        return importlib.util.find_spec("demucs") is not None

    def params_schema(self) -> dict:
        return {
            "model": {"type": "string", "default": "htdemucs", "desc": "Modelo demucs"},
            "two_stems": {"type": "string", "default": "", "desc": "Aísla un stem (p. ej. 'vocals') vs el resto"},
            "device": {"type": "string", "default": "cpu", "enum": ["cpu", "cuda"]},
        }

    def run(self, input_path: Path, params: dict, out_dir: Path) -> EngineResult:
        model = params.get("model") or "htdemucs"
        device = params.get("device") or "cpu"
        two_stems = params.get("two_stems") or ""

        work_out = out_dir / "_demucs"
        work_out.mkdir(parents=True, exist_ok=True)
        cmd = [sys.executable, "-m", "demucs", "-o", str(work_out), "-n", model, "-d", device]
        if two_stems:
            cmd += ["--two-stems", two_stems]
        cmd.append(str(input_path))

        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=3600)
        logs = proc.stdout.decode(errors="replace")[-4000:]
        if proc.returncode != 0:
            raise RuntimeError(f"demucs falló (code {proc.returncode}). Log:\n{logs}")

        # Demucs escribe en _demucs/<model>/<nombre>/<stem>.wav. Aplanamos a out_dir.
        outputs = []
        for wav in sorted(work_out.glob("**/*.wav")):
            dest = out_dir / wav.name
            dest.write_bytes(wav.read_bytes())
            outputs.append(OutputSpec(name=wav.name, kind="audio", meta={"stem": wav.stem}))
        if not outputs:
            raise RuntimeError(f"demucs no produjo stems. Log:\n{logs}")

        return EngineResult(
            outputs=outputs,
            result={"engine": "demucs", "model": model, "device": device,
                    "stems": [o.meta["stem"] for o in outputs]},
            logs=logs,
        )
