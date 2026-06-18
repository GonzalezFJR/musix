"""Engine de separación con python-audio-separator (modelos MDX/UVR vía ONNX).

Más ligero que Demucs en CPU (onnxruntime). El modelo se descarga a una caché la
primera vez. Dependencia opcional: import perezoso + gating por find_spec.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from .base import SEPARATION, Engine, EngineResult, OutputSpec

# Modelo por defecto: 2 stems (voz / instrumental), ligero y rápido en CPU.
DEFAULT_MODEL = "UVR-MDX-NET-Inst_HQ_3.onnx"


class AudioSeparatorEngine(Engine):
    id = "audio-separator"
    kind = SEPARATION
    label = "audio-separator (MDX/UVR, ONNX)"
    needs_gpu = False

    def available(self) -> bool:
        return importlib.util.find_spec("audio_separator") is not None

    def params_schema(self) -> dict:
        return {
            "model": {"type": "string", "default": DEFAULT_MODEL, "desc": "Fichero de modelo MDX/UVR"},
        }

    def run(self, input_path: Path, params: dict, out_dir: Path) -> EngineResult:
        from audio_separator.separator import Separator

        model = params.get("model") or DEFAULT_MODEL
        separator = Separator(output_dir=str(out_dir))
        separator.load_model(model_filename=model)
        # Devuelve rutas (relativas a output_dir) de los stems generados.
        files = separator.separate(str(input_path))

        outputs = []
        for f in files:
            path = Path(f)
            if not path.is_absolute():
                path = out_dir / path
            if path.exists():
                outputs.append(OutputSpec(name=path.name, kind="audio", meta={"stem": path.stem}))
        if not outputs:
            raise RuntimeError("audio-separator no produjo stems")

        return EngineResult(
            outputs=outputs,
            result={"engine": "audio-separator", "model": model,
                    "stems": [o.meta["stem"] for o in outputs]},
            logs=f"audio-separator ok ({model})",
        )
