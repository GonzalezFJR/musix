"""Engine de transcripción mp3→MIDI con Basic Pitch (Spotify).

Transcripción polifónica genérica, CPU-friendly (backend ONNX/TF). Produce un
`transcription.mid`. Dependencia opcional: import perezoso + gating por find_spec.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from .base import TRANSCRIPTION, Engine, EngineResult, OutputSpec


class BasicPitchEngine(Engine):
    id = "basic-pitch"
    kind = TRANSCRIPTION
    label = "Basic Pitch (Spotify)"
    needs_gpu = False

    def available(self) -> bool:
        return importlib.util.find_spec("basic_pitch") is not None

    def params_schema(self) -> dict:
        return {
            "onset_threshold": {"type": "number", "default": 0.5, "desc": "Umbral de onset (0-1)"},
            "frame_threshold": {"type": "number", "default": 0.3, "desc": "Umbral de frame (0-1)"},
            "minimum_note_length": {"type": "number", "default": 127.7, "desc": "Duración mínima de nota (ms)"},
            "minimum_frequency": {"type": "number", "default": None, "desc": "Frecuencia mínima (Hz)"},
            "maximum_frequency": {"type": "number", "default": None, "desc": "Frecuencia máxima (Hz)"},
            "melodia_trick": {"type": "boolean", "default": True},
        }

    def run(self, input_path: Path, params: dict, out_dir: Path) -> EngineResult:
        from basic_pitch import ICASSP_2022_MODEL_PATH
        from basic_pitch.inference import predict

        _, midi_data, note_events = predict(
            str(input_path),
            ICASSP_2022_MODEL_PATH,
            onset_threshold=float(params.get("onset_threshold", 0.5)),
            frame_threshold=float(params.get("frame_threshold", 0.3)),
            minimum_note_length=float(params.get("minimum_note_length", 127.7)),
            minimum_frequency=params.get("minimum_frequency"),
            maximum_frequency=params.get("maximum_frequency"),
            multiple_pitch_bends=bool(params.get("multiple_pitch_bends", False)),
            melodia_trick=bool(params.get("melodia_trick", True)),
        )

        midi_path = out_dir / "transcription.mid"
        midi_data.write(str(midi_path))

        # note_events: lista de (start_s, end_s, pitch_midi, amplitude, pitch_bends)
        pitches = [int(ev[2]) for ev in note_events] if note_events else []
        result = {
            "engine": "basic-pitch",
            "note_count": len(note_events or []),
            "pitch_min": min(pitches) if pitches else None,
            "pitch_max": max(pitches) if pitches else None,
            "duration_seconds": round(max((ev[1] for ev in note_events), default=0.0), 3),
        }
        return EngineResult(
            outputs=[OutputSpec(name="transcription.mid", kind="midi", meta={"notes": result["note_count"]})],
            result=result,
            logs=f"basic-pitch ok ({result['note_count']} notas)",
        )
