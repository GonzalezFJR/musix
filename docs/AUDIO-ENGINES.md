# Audio Lab — catálogo de engines

Engines del [Audio Lab](ROADMAP-DEV.md) (análisis / separación / transcripción). Cada
engine implementa la interfaz uniforme (`app/audio/engines/base.py`) y se registra en
`app/audio/engines/__init__.py`. Las dependencias pesadas se importan de forma perezosa:
`available()` (vía `importlib.util.find_spec`) indica si están instaladas, así que un
engine sin sus deps aparece como **no disponible** en el catálogo en lugar de romper.

`GET /api/audio/engines` devuelve el catálogo con `available` por engine.

## Análisis (`kind=analysis`)

| id | deps | GPU | salida | estado |
|---|---|---|---|---|
| `probe` | — (ffprobe opcional) | no | `analysis.json` (tamaño, hash, duración/formato) | ✅ siempre |
| `librosa` | `librosa`, `matplotlib`, `soundfile`, `libsndfile1` | no | `analysis.json` (tempo, beats, tonalidad K-S, RMS) + `spectrogram.png` | ✅ (en imagen dev) |
| `essentia` | `essentia` (wheels no siempre disponibles) | no | `analysis.json` (bpm, tonalidad, loudness) | ⚠️ si hay wheel |

Notas:
- **librosa**: tonalidad por croma CQT + correlación de Krumhansl-Schmuckler
  (`engines/_keys.py`). El espectrograma se omite si falta `matplotlib`.
- **essentia**: `RhythmExtractor2013` (bpm) + `KeyExtractor`. Su instalación por pip
  depende de la plataforma; en la imagen dev se intenta con `|| true` y si no, el engine
  queda no disponible.

## Separación de pistas (`kind=separation`) — Fase 4 (pendiente)

| id | deps | GPU | notas |
|---|---|---|---|
| `audio-separator` | `audio-separator` (onnxruntime) | opcional | modelos MDX/UVR; CPU razonable |
| `demucs` | `demucs` (torch) | recomendable | htdemucs; CPU lento, GPU rápido |

## Transcripción mp3→MIDI (`kind=transcription`) — Fase 5 (pendiente)

| id | deps | GPU | notas |
|---|---|---|---|
| `basic-pitch` | `basic-pitch` (tf/onnx) | no | polifónico genérico, CPU-friendly (referencia) |
| `yourmt3` / `mt3` / `omnizart` / `sheetsage` | varias (delicadas) | sí | contenedores aislados, diferidos a disponibilidad de GPU |

## Cómo añadir un engine

1. Crear `app/audio/engines/<nombre>_engine.py` con una subclase de `Engine`:
   - `id`, `kind`, `label`, `needs_gpu`.
   - `available()` → comprobar deps con `find_spec` (no importar la librería aquí).
   - `run(input_path, params, out_dir)` → escribir artefactos en `out_dir` y devolver
     `EngineResult(outputs=[OutputSpec(...)], result={...}, logs="...")`.
2. Registrarlo en `engines/__init__.py`.
3. Añadir sus dependencias a `apps/api/Dockerfile.dev` (tolerante si pueden faltar).
4. No hace falta tocar el orquestador, el worker ni la UI.
