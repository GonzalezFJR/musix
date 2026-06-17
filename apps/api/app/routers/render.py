"""Render de audio: recibe un MIDI por pista (generado en el frontend con AlphaTab)
y un mapa de instrumentos, renderiza cada pista con su motor (FluidSynth para SF2,
sfizz para SFZ), mezcla todas las pistas con ffmpeg y devuelve un MP3.

La mezcla (volumen/pan por pista) ya viene aplicada dentro de cada MIDI vía los
controladores que genera AlphaTab; aquí solo sumamos las pistas y normalizamos."""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, Response, UploadFile, status

from ..catalog import attribution_for, resolve_sfz_path, soundfont_path
from ..config import get_settings
from ..deps import RenderUser

router = APIRouter(prefix="/api/render", tags=["render"])
settings = get_settings()

MAX_MIDI_BYTES = 8 * 1024 * 1024
MAX_TRACKS = 32
ALLOWED_BITRATES = {"96k", "128k", "160k", "192k", "256k", "320k"}
RENDER_TIMEOUT = 240
SAMPLE_RATE = 44100
LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"


def _latin1_safe(s: str) -> str:
    """Las cabeceras HTTP solo admiten latin-1. Normaliza la puntuación Unicode
    habitual (guiones largos, comillas tipográficas) y sustituye lo que no encaje."""
    repl = {"—": "-", "–": "-", "‘": "'", "’": "'", "“": '"', "”": '"'}
    for k, v in repl.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Falta '{tool}' en el servidor de render.")
    return path


def _run(cmd: list[str], what: str) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=RENDER_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, f"{what}: tardó demasiado.")
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"{what} falló: {e.stderr.decode('utf-8', 'ignore')[:300]}",
        )


@router.post("/mp3")
def render_mp3(
    user: RenderUser,
    midi: list[UploadFile],
    instruments: str = Form("[]"),
    bitrate: str = Form("192k"),
    gain: float = Form(0.7),
    filename: str = Form("musix"),
) -> Response:
    if bitrate not in ALLOWED_BITRATES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Bitrate no soportado: {bitrate}")
    if not midi:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se recibió ningún MIDI.")
    if len(midi) > MAX_TRACKS:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Demasiadas pistas.")
    gain = max(0.1, min(2.0, gain))
    try:
        specs = json.loads(instruments)
        assert isinstance(specs, list)
    except Exception:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Mapa de instrumentos inválido.")
    # Si faltan specs, las pistas restantes usan SF2 por defecto.
    while len(specs) < len(midi):
        specs.append({"engine": "sf2"})

    fluidsynth = _require("fluidsynth")
    ffmpeg = _require("ffmpeg")
    sfizz = shutil.which("sfizz_render")

    tmp = Path(tempfile.mkdtemp(prefix="musix-render-"))
    attributions: list[str] = []
    try:
        wavs: list[Path] = []
        for i, (f, spec) in enumerate(zip(midi, specs)):
            data = f.file.read()
            if not data:
                continue
            if len(data) > MAX_MIDI_BYTES:
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "MIDI demasiado grande.")
            mid = tmp / f"{i}.mid"
            wav = tmp / f"{i}.wav"
            mid.write_bytes(data)

            engine = (spec or {}).get("engine", "sf2")
            if engine == "sfz":
                if not sfizz:
                    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Motor SFZ (sfizz) no disponible.")
                sfz_path = resolve_sfz_path((spec or {}).get("id", ""))
                if not sfz_path:
                    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Instrumento SFZ no encontrado.")
                _run([sfizz, "--sfz", sfz_path, "--midi", str(mid), "--wav", str(wav), "-s", str(SAMPLE_RATE)], "sfizz")
                attr = attribution_for((spec or {}).get("id", ""))
                if attr:
                    attributions.append(attr)
            else:
                sf = soundfont_path((spec or {}).get("soundfont", soundfont_path().name))
                if not sf.is_file():
                    raise HTTPException(
                        status.HTTP_503_SERVICE_UNAVAILABLE,
                        "SoundFont base no disponible. Ejecuta scripts/fetch-soundbanks.sh.",
                    )
                _run([fluidsynth, "-ni", "-g", str(gain), "-r", str(SAMPLE_RATE), "-F", str(wav), str(sf), str(mid)], "FluidSynth")
            if wav.is_file() and wav.stat().st_size > 0:
                wavs.append(wav)

        if not wavs:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No se generó audio.")

        mp3 = tmp / "out.mp3"
        cmd = [ffmpeg, "-y"]
        for w in wavs:
            cmd += ["-i", str(w)]
        if len(wavs) == 1:
            cmd += ["-af", LOUDNORM]
        else:
            cmd += ["-filter_complex", f"amix=inputs={len(wavs)}:normalize=0,{LOUDNORM}"]
        comment = "Musix"
        if attributions:
            comment = "Musix — Créditos: " + "; ".join(dict.fromkeys(attributions))
        cmd += ["-metadata", f"comment={comment}", "-codec:a", "libmp3lame", "-b:a", bitrate, str(mp3)]
        _run(cmd, "ffmpeg")

        audio = mp3.read_bytes()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    safe = "".join(c for c in filename if c.isalnum() or c in " -_").strip() or "musix"
    headers = {"Content-Disposition": f'attachment; filename="{safe}.mp3"'}
    if attributions:
        headers["X-Musix-Attributions"] = _latin1_safe(" | ".join(dict.fromkeys(attributions)))
    return Response(content=audio, media_type="audio/mpeg", headers=headers)
