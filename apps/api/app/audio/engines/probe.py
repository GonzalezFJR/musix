"""Engine 'probe': análisis básico sin dependencias pesadas.

Sirve para validar el pipeline de extremo a extremo (CPU, sin instalar nada). Usa
`ffprobe` si está disponible (viene con ffmpeg, ya presente en la imagen) para sacar
duración/formato; si no, reporta tamaño y hash. Escribe un `analysis.json`.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from .base import ANALYSIS, Engine, EngineResult, OutputSpec


def _ffprobe(path: Path) -> dict:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {}
    try:
        out = subprocess.run(
            [ffprobe, "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
        )
        data = json.loads(out.stdout.decode() or "{}")
    except (subprocess.SubprocessError, ValueError):
        return {}
    fmt = data.get("format", {})
    audio = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    return {
        "duration_seconds": float(fmt["duration"]) if fmt.get("duration") else None,
        "format": fmt.get("format_name"),
        "bit_rate": int(fmt["bit_rate"]) if fmt.get("bit_rate") else None,
        "sample_rate": int(audio["sample_rate"]) if audio.get("sample_rate") else None,
        "channels": audio.get("channels"),
        "codec": audio.get("codec_name"),
    }


class ProbeEngine(Engine):
    id = "probe"
    kind = ANALYSIS
    label = "Sonda básica (ffprobe)"

    def run(self, input_path: Path, params: dict, out_dir: Path) -> EngineResult:
        data = input_path.read_bytes()
        result = {
            "size_bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            **_ffprobe(input_path),
        }
        (out_dir / "analysis.json").write_text(json.dumps(result, indent=2))
        return EngineResult(
            outputs=[OutputSpec(name="analysis.json", kind="json", meta={})],
            result=result,
            logs="probe ok",
        )
