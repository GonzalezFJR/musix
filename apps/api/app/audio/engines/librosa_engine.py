"""Engine de análisis con librosa (CPU).

Extrae tempo/beats, tonalidad (croma + Krumhansl-Schmuckler), loudness (RMS) y
genera un espectrograma mel en PNG. Las dependencias se importan de forma perezosa;
`available()` solo comprueba que estén instaladas (sin importarlas).
"""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

from ._keys import estimate_key
from .base import ANALYSIS, Engine, EngineResult, OutputSpec


def _has(mod: str) -> bool:
    return importlib.util.find_spec(mod) is not None


class LibrosaEngine(Engine):
    id = "librosa"
    kind = ANALYSIS
    label = "librosa (tempo, tonalidad, espectrograma)"

    def available(self) -> bool:
        return _has("librosa")

    def params_schema(self) -> dict:
        return {
            "spectrogram": {"type": "boolean", "default": True, "desc": "Generar espectrograma PNG"},
        }

    def run(self, input_path: Path, params: dict, out_dir: Path) -> EngineResult:
        import librosa
        import numpy as np

        y, sr = librosa.load(str(input_path), mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))

        # Tempo y beats.
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        tempo_bpm = round(float(np.atleast_1d(tempo)[0]), 2)
        beat_times = librosa.frames_to_time(beats, sr=sr).tolist()

        # Tonalidad: croma CQT promediado → K-S.
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = chroma.mean(axis=1)
        key = estimate_key([float(x) for x in chroma_mean])

        # Loudness aproximada (RMS en dBFS).
        rms = float(np.mean(librosa.feature.rms(y=y)))
        rms_db = round(20 * math.log10(rms), 2) if rms > 0 else None

        result = {
            "engine": "librosa",
            "duration_seconds": round(duration, 3),
            "sample_rate": sr,
            "tempo_bpm": tempo_bpm,
            "beat_count": len(beat_times),
            "beat_times": [round(t, 3) for t in beat_times[:512]],
            "key": key["name"],
            "key_root": key["key"],
            "key_scale": key["scale"],
            "key_confidence": key["confidence"],
            "rms_dbfs": rms_db,
        }

        outputs = [OutputSpec(name="analysis.json", kind="json")]
        (out_dir / "analysis.json").write_text(json.dumps(result, indent=2))

        if params.get("spectrogram", True) and _has("matplotlib"):
            self._spectrogram(y, sr, out_dir / "spectrogram.png")
            outputs.append(OutputSpec(name="spectrogram.png", kind="image"))

        return EngineResult(outputs=outputs, result=result, logs=f"librosa ok ({duration:.1f}s @ {sr}Hz)")

    @staticmethod
    def _spectrogram(y, sr, path: Path) -> None:
        import librosa
        import librosa.display  # noqa: F401
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np

        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        fig, ax = plt.subplots(figsize=(10, 4))
        librosa.display.specshow(mel_db, sr=sr, x_axis="time", y_axis="mel", ax=ax)
        ax.set_title("Mel spectrogram")
        fig.colorbar(ax.collections[0], ax=ax, format="%+2.0f dB")
        fig.tight_layout()
        fig.savefig(path, dpi=90)
        plt.close(fig)
