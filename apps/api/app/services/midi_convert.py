"""Conversión MIDI → operaciones de la Score API (Fase 6).

Parsea un `.mid` con `mido` (puro-Python, sin numpy) y lo **cuantiza** a una rejilla
de semicorcheas para producir una lista de operaciones (`ops`) que el sidecar AlphaTab
aplica para construir un `.mu6` editable.

v1 pragmática (la cuantización perfecta es un problema difícil):
- Un solo tempo y un solo compás (los primeros del fichero; por defecto 120 y 4/4).
- Rejilla de semicorcheas; acordes = notas que comparten onset cuantizado.
- Duraciones descompuestas en figuras representables; sin ligaduras (las partes
  sobrantes de una nota larga se rellenan con silencios). Notas solapadas: se ignoran
  las que empiezan antes de que acabe la anterior (monofoniza por pista).

El resultado es un punto de partida editable, no una transcripción rítmica exacta.
"""

from __future__ import annotations

import io
from typing import Optional

# Figuras permitidas en semicorcheas → (nombre de duración, puntillos), de mayor a menor.
_DURATIONS = [
    (16, "whole", 0), (12, "half", 1), (8, "half", 0), (6, "quarter", 1),
    (4, "quarter", 0), (3, "eighth", 1), (2, "eighth", 0), (1, "sixteenth", 0),
]

MAX_BARS = 400  # cota de seguridad para MIDIs largos
MAX_TRACKS = 12


def _decompose(sixteenths: int) -> list[tuple[str, int]]:
    """Descompone una longitud en semicorcheas en figuras representables (greedy)."""
    out: list[tuple[str, int]] = []
    remaining = sixteenths
    while remaining > 0:
        for n, name, dots in _DURATIONS:
            if n <= remaining:
                out.append((name, dots))
                remaining -= n
                break
        else:
            break
    return out


def _parse_notes(mid):
    """Devuelve (bpm, num, den, tracks) donde tracks es lista de listas de notas
    {start, dur, pitch} en TICKS, ya emparejadas note_on/note_off."""
    import mido

    tpb = mid.ticks_per_beat or 480
    bpm = 120.0
    num, den = 4, 4
    got_tempo = got_ts = False

    track_notes: list[list[dict]] = []
    for track in mid.tracks:
        t = 0
        active: dict[tuple[int, int], tuple[int, int]] = {}  # (chan,pitch) → (start, vel)
        notes: list[dict] = []
        for msg in track:
            t += msg.time
            if msg.type == "set_tempo" and not got_tempo:
                bpm = round(mido.tempo2bpm(msg.tempo), 2)
                got_tempo = True
            elif msg.type == "time_signature" and not got_ts:
                num, den = msg.numerator, msg.denominator
                got_ts = True
            elif msg.type == "note_on" and msg.velocity > 0:
                active[(msg.channel, msg.note)] = (t, msg.velocity)
            elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
                key = (msg.channel, msg.note)
                if key in active:
                    start, _ = active.pop(key)
                    if t > start:
                        notes.append({"start": start, "dur": t - start, "pitch": msg.note})
        if notes:
            track_notes.append(sorted(notes, key=lambda n: (n["start"], n["pitch"])))
    return bpm, num, den, tpb, track_notes


def _quantize_track(notes: list[dict], tpb: int) -> list[dict]:
    """Cuantiza a semicorcheas y agrupa en acordes por onset. Devuelve lista de
    {start16, len16, pitches} ordenada y monofonizada (sin solapes)."""
    grid = tpb / 4.0  # ticks por semicorchea
    chords: dict[int, dict] = {}
    for n in notes:
        s16 = int(round(n["start"] / grid))
        l16 = max(1, int(round(n["dur"] / grid)))
        c = chords.setdefault(s16, {"start16": s16, "len16": l16, "pitches": []})
        c["pitches"].append(n["pitch"])
        c["len16"] = min(c["len16"], l16)  # duración del acorde = nota más corta
    ordered = [chords[k] for k in sorted(chords)]
    # Monofoniza: recorta/elimina solapes.
    result = []
    cursor = 0
    for c in ordered:
        if c["start16"] < cursor:
            continue  # empieza antes de acabar el anterior → se descarta
        result.append(c)
        cursor = c["start16"] + c["len16"]
    return result


def midi_to_score(data: bytes, title: str = "") -> dict:
    """Devuelve {meta, ops} listos para `score_engine.apply`."""
    import mido

    mid = mido.MidiFile(file=io.BytesIO(data))
    bpm, num, den, tpb, track_notes = _parse_notes(mid)
    track_notes = track_notes[:MAX_TRACKS]

    spb = max(1, num * 16 // den)  # semicorcheas por compás

    quantized = [_quantize_track(notes, tpb) for notes in track_notes]
    max_end = max((c["start16"] + c["len16"] for tn in quantized for c in tn), default=spb)
    num_bars = min(MAX_BARS, max(1, -(-max_end // spb)))  # ceil

    ops: list[dict] = []
    ops.append({"op": "setBarTime", "index": 0, "numerator": num, "denominator": den})
    for _ in range(num_bars - 1):
        ops.append({"op": "appendBar", "numerator": num, "denominator": den})

    # La partitura nueva ya trae 1 pista (índice 0): la reutilizamos para la primera.
    for ti, qnotes in enumerate(quantized):
        name = f"Pista {ti + 1}"
        if ti == 0:
            ops.append({"op": "updateTrack", "track": 0, "name": name})
        else:
            ops.append({"op": "addTrack", "name": name})
        ops.extend(_track_beat_ops(ti, qnotes, num_bars, spb))

    meta = {"title": title or "Importado de MIDI", "tempo": bpm}
    return {"meta": meta, "ops": ops}


def _track_beat_ops(track: int, chords: list[dict], num_bars: int, spb: int) -> list[dict]:
    """Genera addBeat (notas + silencios de relleno) por compás para una pista."""
    ops: list[dict] = []
    by_bar: dict[int, list[dict]] = {}
    for c in chords:
        by_bar.setdefault(c["start16"] // spb, []).append(c)

    for bar in range(num_bars):
        bar_chords = by_bar.get(bar)
        if not bar_chords:
            continue  # compás vacío → placeholder (silencio)
        bar_start = bar * spb
        cursor = bar_start
        for c in bar_chords:
            start = c["start16"]
            if start < cursor:
                continue
            # Silencio de relleno hasta el onset.
            if start > cursor:
                for name, dots in _decompose(start - cursor):
                    ops.append({"op": "addBeat", "track": track, "bar": bar, "duration": name, "dots": dots, "rest": True})
            # La nota/acorde, recortada al final del compás.
            length = min(c["len16"], bar_start + spb - start)
            pieces = _decompose(length)
            notes = [{"pitch": p} for p in c["pitches"]]
            for i, (name, dots) in enumerate(pieces):
                if i == 0:
                    ops.append({"op": "addBeat", "track": track, "bar": bar, "duration": name, "dots": dots, "notes": notes})
                else:
                    ops.append({"op": "addBeat", "track": track, "bar": bar, "duration": name, "dots": dots, "rest": True})
            cursor = start + length
    return ops
