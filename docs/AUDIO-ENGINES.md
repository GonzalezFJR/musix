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

## Separación de pistas (`kind=separation`) — Fase 4 ✅ (instalación opcional)

| id | deps | GPU | salida | estado |
|---|---|---|---|---|
| `demucs` | `demucs` (torch) | usa GPU si hay | stems `.wav` (vocals/drums/bass/other) | ⚙️ opcional |
| `audio-separator` | `audio-separator[cpu]` (onnxruntime) | opcional | stems `.wav` (voz/instrumental) | ⚙️ opcional |

Implementados y registrados, pero **no instalados por defecto** (torch pesa ~GBs). Se
activan al construir la imagen dev con el build-arg:

```bash
INSTALL_SEPARATION=true docker compose -f docker-compose.dev.yml build
# o: docker compose -f docker-compose.dev.yml build --build-arg INSTALL_SEPARATION=true
```

Sin instalar, aparecen como *no disponibles* en el catálogo. Notas:
- **demucs**: se invoca por CLI (`python -m demucs`), robusto entre versiones; CPU lento.
  Param `two_stems` (p. ej. `"vocals"`) para 2 stems; `device` `cpu`/`cuda`.
- **audio-separator**: modelos MDX/UVR (ONNX), se descargan a caché la primera vez.
- La UI reproduce los stems de audio automáticamente y permite descargarlos.

## Transcripción mp3→MIDI (`kind=transcription`) — Fase 5 ✅ (Basic Pitch; resto diferido)

| id | deps | GPU | salida | estado |
|---|---|---|---|---|
| `basic-pitch` | `basic-pitch` + `onnxruntime` | no | `transcription.mid` | ⚙️ opcional (CPU, referencia) |
| `yourmt3` / `mt3` / `omnizart` / `sheetsage` | varias (delicadas) | sí | `.mid` | 🕒 diferido (contenedores GPU) |

**Basic Pitch** (Spotify): polifónico genérico, CPU-friendly (backend ONNX). Implementado
y registrado; instalación opcional vía build-arg:

```bash
INSTALL_TRANSCRIPTION=true docker compose -f docker-compose.dev.yml build
```

Params: `onset_threshold`, `frame_threshold`, `minimum_note_length`, `minimum_frequency`,
`maximum_frequency`, `melodia_trick`. El `.mid` resultante se descarga desde la UI y, en
la Fase 6, podrá convertirse en un proyecto Musix editable.

> ⚠️ **Caveat de instalación**: basic-pitch fija versiones antiguas de numpy/TF y su
> instalación puede fallar en **Python 3.12** (la imagen dev). Por eso el build-arg es
> tolerante (si falla, el engine queda "no disponible"). Para usarlo de forma fiable:
> backend ONNX (`basic-pitch[onnx]`) o un worker con **Python 3.11**. Validado por
> construcción + gating; el run real de transcripción se confirma en ese entorno.

### Engines pesados (diferidos a GPU)

`YourMT3`, `MT3`, `Omnizart` y `SheetSage` ofrecen transcripción de mayor calidad pero
tienen **dependencias delicadas** (MT3/Omnizart son TF1-era; YourMT3 es torch; SheetSage
trae su propio stack) y rinden bien **solo con GPU**. Plan: cada uno como **contenedor
aislado** que expone la misma interfaz de engine (audio→`.mid`) y se registra como engine
remoto cuando haya GPU disponible (cloud o máquina dedicada). No se instalan en la imagen
dev CPU. Se abordarán cuando se disponga de GPU (ver [ROADMAP-DEV.md](ROADMAP-DEV.md)).

## Cómo añadir un engine

1. Crear `app/audio/engines/<nombre>_engine.py` con una subclase de `Engine`:
   - `id`, `kind`, `label`, `needs_gpu`.
   - `available()` → comprobar deps con `find_spec` (no importar la librería aquí).
   - `run(input_path, params, out_dir)` → escribir artefactos en `out_dir` y devolver
     `EngineResult(outputs=[OutputSpec(...)], result={...}, logs="...")`.
2. Registrarlo en `engines/__init__.py`.
3. Añadir sus dependencias a `apps/api/Dockerfile.dev` (tolerante si pueden faltar).
4. No hace falta tocar el orquestador, el worker ni la UI.
