"""Estimación de tonalidad por correlación de Krumhansl-Schmuckler.

Dado un vector de croma de 12 semitonos (energía media por clase de altura),
correlaciona con los perfiles mayor/menor en las 12 rotaciones y devuelve la
tonalidad más probable. Independiente de librosa/essentia (solo aritmética).
"""

from __future__ import annotations

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Perfiles de Krumhansl-Kessler.
_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def _corr(a: list[float], b: list[float]) -> float:
    n = len(a)
    ma = sum(a) / n
    mb = sum(b) / n
    num = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((x - mb) ** 2 for x in b) ** 0.5
    return num / (da * db) if da and db else 0.0


def estimate_key(chroma: list[float]) -> dict:
    """chroma: 12 valores (C..B). Devuelve {key, scale, confidence, name}."""
    best = {"key": "C", "scale": "major", "confidence": 0.0}
    for tonic in range(12):
        rotated = [chroma[(tonic + i) % 12] for i in range(12)]
        for scale, profile in (("major", _MAJOR), ("minor", _MINOR)):
            score = _corr(rotated, profile)
            if score > best["confidence"]:
                best = {"key": NOTE_NAMES[tonic], "scale": scale, "confidence": round(score, 4)}
    best["name"] = f"{best['key']} {best['scale']}"
    return best
