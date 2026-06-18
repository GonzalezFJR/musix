"""Engine de análisis con Essentia (CPU).

Descriptores musicales: BPM (RhythmExtractor2013), tonalidad (KeyExtractor) y
loudness. Dependencias perezosas; `available()` solo comprueba instalación.

Nota: Essentia puede ser delicado de instalar (wheels solo para algunas
plataformas). Si no está, este engine aparece como no disponible.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from .base import ANALYSIS, Engine, EngineResult, OutputSpec


class EssentiaEngine(Engine):
    id = "essentia"
    kind = ANALYSIS
    label = "Essentia (bpm, tonalidad, loudness)"

    def available(self) -> bool:
        return importlib.util.find_spec("essentia") is not None

    def run(self, input_path: Path, params: dict, out_dir: Path) -> EngineResult:
        import essentia
        import essentia.standard as es

        essentia.log.infoActive = False  # silenciar logs ruidosos

        audio = es.MonoLoader(filename=str(input_path))()
        sr = 44100  # MonoLoader remuestrea a 44.1k por defecto

        bpm, beats, beats_conf, _, _ = es.RhythmExtractor2013(method="multifeature")(audio)
        key, scale, key_strength = es.KeyExtractor()(audio)

        try:
            loudness = float(es.Loudness()(audio))
        except Exception:  # noqa: BLE001
            loudness = None

        result = {
            "engine": "essentia",
            "duration_seconds": round(len(audio) / sr, 3),
            "tempo_bpm": round(float(bpm), 2),
            "beat_count": int(len(beats)),
            "beats_confidence": round(float(beats_conf), 4),
            "key": f"{key} {scale}",
            "key_root": key,
            "key_scale": scale,
            "key_strength": round(float(key_strength), 4),
            "loudness": loudness,
        }
        (out_dir / "analysis.json").write_text(json.dumps(result, indent=2))
        return EngineResult(
            outputs=[OutputSpec(name="analysis.json", kind="json")],
            result=result,
            logs="essentia ok",
        )
