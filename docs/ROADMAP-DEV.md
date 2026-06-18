# Roadmap de desarrollo (rama `dev`)

> Plan por fases para: (1) API programática de edición de partituras pensada para
> ser usada por un LLM vía *tools*, (2) entorno de pruebas de análisis/separación/
> transcripción de audio, y (7) integración de un asistente IA agéntico.
>
> Todo se desarrolla y prueba **primero en `dev`** (despliegue local: SQLite +
> disco + sin login, ver [README](../README.md)). Producción (`main`/`docker-compose.prod.yml`,
> DynamoDB + S3 + login) no cambia de comportamiento: cada capacidad nueva va
> detrás de flags o servicios opcionales.

## Estado

- ✅ **Fase 1 — Score API**: sidecar AlphaTab + `/api/score` (ver [SCORE-API.md](SCORE-API.md)).
- ✅ **Fundaciones de audio + Fase 2 (base)**: modelo `AudioJob` + repos (SQLite/Dynamo),
  claves de storage, registro de engines + engine `probe`, orquestador `/api/audio`,
  worker (`python -m app.audio.worker`, servicio `audio-worker`) y vista **Audio Lab**.
- ⏳ **Fases 3–6**: engines reales (librosa/essentia, demucs/audio-separator,
  Basic Pitch/…); conversión MIDI→Musix.
- 🕒 **Fase 7** (diferida): asistente IA.

## Decisiones tomadas

- **Cómputo:** CPU en local por ahora. Los engines pesados (separación/transcripción
  que requieren GPU) se diseñan como **contenedores desplegables aparte** y opcionales;
  empezamos validando el pipeline con engines que corren en CPU.
- **Validez de partituras:** el `.mu6` es JSON de AlphaTab (librería JS). Adoptamos una
  **representación intermedia (IR) propia y documentada** como contrato estable para el
  LLM, y un **sidecar Node que reutiliza el fork de AlphaTab** (`JsonConverter` +
  `score.finish()`) como **fuente de verdad** para validar/normalizar.

## Principios de arquitectura

1. **dev-first y aislado.** Nada de lo pesado (ML/audio) entra en el contenedor `api`
   (FastAPI delgado). Va en servicios/contenedores aparte para no romper dependencias.
2. **Engines enchufables.** Análisis, separación y transcripción son "engines" que
   implementan una **interfaz uniforme** (audio de entrada → artefactos de salida) y se
   registran en un catálogo. Así se comparan tecnologías sin tocar el orquestador.
3. **Trabajos asíncronos.** El audio es lento → modelo `AudioJob` con estado y *polling*;
   nunca bloquear un request HTTP.
4. **Reutilizar lo que hay.** Capa de `storage/` (claves nuevas), capa de repos
   (`db/base.py` + impls SQLite/Dynamo), pipeline de render existente, importadores.
5. **Contrato LLM estable.** Las *tools* del asistente se mapean a endpoints REST
   versionados y documentados (OpenAPI), desacoplados de los internos de AlphaTab.

## Visión de componentes (objetivo)

```
                          ┌─────────────────────────────────────────────┐
  Navegador (React) ──────┤ FastAPI `api` (delgado, CPU)                 │
   • Editor partitura     │  • Projects/Score API (Fase 1)              │
   • Audio Lab (Fase 2)   │  • Audio orchestrator + AudioJob (Fase 2)   │
   • Chat IA (Fase 7)     │  • LLM gateway (Fase 7)                     │
                          └───┬───────────────┬──────────────┬──────────┘
                              │ subprocess     │ cola/HTTP     │ OAuth
                     ┌────────▼──────┐  ┌──────▼───────┐  ┌────▼─────────┐
                     │ score-engine  │  │ audio-worker │  │ Claude Code /│
                     │ (Node+AlphaTab│  │ engines:     │  │ Codex (OAuth)│
                     │  validador)   │  │  analysis/   │  └──────────────┘
                     └───────────────┘  │  separation/ │
                                        │  transcription│  (contenedores
                                        └──────────────┘   opcionales, GPU
                                                            desplegable aparte)
  Storage (disco dev / S3 prod): users/{id}/projects/... y users/{id}/audio/{job}/...
```

---

## Fundaciones transversales (habilitan Fases 2–6)

Se hacen una vez, al empezar la Fase 2 (o junto a la 1 si conviene):

- **Modelo `AudioJob`** (`apps/api/app/models.py`): `id`, `owner_id`, `kind`
  (`analysis|separation|transcription`), `engine`, `status`
  (`queued|running|done|error`), `input_ref`, `params`, `outputs` (lista de refs en
  storage), `logs`, `error`, `created_at`, `updated_at`.
- **Repos `jobs`** en `db/base.py` + implementación en `db/sqlite.py` (tabla `audio_jobs`)
  y `db/dynamo.py` (items `pk=USER#{id}` `sk=AJOB#{ulid}`, GSI para listar por estado).
  Replicar el patrón ya usado (cursores, orden).
- **Claves de storage**: `users/{uid}/audio/{job_id}/input.{ext}`,
  `.../stems/{name}.wav`, `.../transcription.mid`, `.../analysis.json`.
- **Patrón de jobs asíncronos**: empezar simple para dev — tabla de jobs + worker que
  hace *long-poll* de `queued` (un proceso aparte, sin broker). Interfaz preparada para
  migrar a **Redis + RQ/Celery** si hace falta concurrencia/escala. Decisión de broker
  se confirma al iniciar la Fase 2.
- **Interfaz de engine** (contrato uniforme): cada engine es un módulo/contenedor con
  `describe() -> {id, kind, needs_gpu, params_schema}` y
  `run(input_path, params, out_dir) -> {outputs, metrics, logs}`. Registro central en
  `apps/audio/engines/registry`.

---

## Fase 1 — API de edición de partituras (para LLM)

**Objetivo.** Endpoints granulares y bien documentados para crear y modificar proyectos,
pistas, compases, voces, beats y notas, de modo que un LLM (Fase 7) los use como *tools*.
Construir sobre `routers/projects.py` y el `.mu6` existente.

### 1.1 Ground truth y sidecar de validación
- Exportar 2–3 partituras reales desde el editor a `.mu6` como **fixtures** de referencia.
- **score-engine sidecar** (`apps/score-engine/`, Node + fork AlphaTab): CLI que lee JSON
  por stdin y:
  - `validate`: carga vía `JsonConverter.jsonToScore` + `score.finish(settings)` y
    devuelve errores o el JSON **normalizado**.
  - `from-ir` / `to-ir`: convierte entre la **IR Musix** y el JSON de AlphaTab.
  - `new`: genera una partitura mínima válida (1 pista, 1 compás, time sig 4/4, tempo).
  - (opcional) `to-midi`: reutiliza el generador MIDI para validación sonora.
  - Se invoca como **subprocess** desde `api` (sin servicio persistente). Node se añade
    al contenedor `api` solo en dev; en prod queda como capacidad opcional.

### 1.2 Representación intermedia (IR Musix)
JSON simple, plano y estable, p. ej.:
```jsonc
{
  "meta": { "title": "...", "artist": "...", "tempo": 120 },
  "tracks": [{
    "name": "Guitar", "midiProgram": 25, "tuning": [64,59,55,50,45,40], "capo": 0,
    "bars": [{
      "time": [4,4], "voices": [[
        { "duration": "quarter", "dots": 0, "rest": false,
          "notes": [{ "string": 1, "fret": 3 }] },   // o { "pitch": "C4" } sin traste
        { "duration": "quarter", "rest": true }
      ]]
    }]
  }]
}
```
- Direccionamiento estable por índices: `track/bar/voice/beat/note`.
- La IR oculta invariantes de AlphaTab (p. ej. añadir un compás inserta un `masterBar`
  alineado en **todas** las pistas/staves; los IDs se reasignan al normalizar).
- Conversión IR↔AlphaTab vive en el sidecar (fuente de verdad).

### 1.3 Endpoints (REST, versionados bajo `/api/score`)
Operan sobre un proyecto del usuario; cargan/guardan el `.mu6` vía `storage` y validan
con el sidecar antes de persistir.

- Lectura: `GET /api/projects/{id}/score-ir` → IR completa.
- Metadatos: `PATCH /api/score/{id}/meta` (title, artist, tempo).
- Pistas: `POST/PATCH/DELETE /api/score/{id}/tracks[/{t}]` (nombre, instrumento GM, afinación).
- Compases: `POST/DELETE /api/score/{id}/bars` (append/insert/delete; mantiene alineación
  global), `PATCH .../bars/{b}` (time signature, repeticiones, sección).
- Voces/beats: `POST/PATCH/DELETE .../tracks/{t}/bars/{b}/voices/{v}/beats[/{i}]`
  (duración, puntillo, silencio, tresillos, texto/letra/acorde, dinámica).
- Notas: `POST/PATCH/DELETE .../beats/{i}/notes[/{n}]` (string+fret o pitch; ligaduras).
- Atajos de alto nivel pensados para el LLM: `append_measure`, `set_note`, `add_chord`,
  `add_track_from_instrument`, `transpose`, `set_tempo`.
- Batch: `POST /api/score/{id}/ops` con una lista de operaciones atómicas (todo o nada).

### 1.4 Concurrencia, validación y errores
- **Bloqueo optimista**: `score_version`/ETag en el proyecto; `PATCH` con versión obsoleta → 409.
- Toda mutación pasa por el sidecar `validate`; si AlphaTab rechaza, **400 con detalle**
  y no se persiste.
- Errores legibles y accionables (clave para que el LLM se autocorrija).

### 1.5 Documentación y *tool-readiness*
- OpenAPI enriquecido (descripciones, ejemplos) por endpoint.
- Documento `docs/SCORE-API.md` con la spec de la IR, invariantes y ejemplos.
- Generar un **manifiesto de tools** (JSON Schema por operación) reutilizable en Fase 7.

**Entregable / criterios de aceptación (dev):** crear un proyecto vacío vía API, añadir
pista + compases + notas, abrirlo en el editor y que **renderice y suene**; round-trip
IR→AlphaTab→IR estable; tests de los endpoints y del sidecar.

---

## Fase 2 — Entorno de pruebas de audio (ingesta + orquestación + UI)

**Objetivo.** Vista donde el usuario **arrastra un MP3** (u otros formatos) o **pega un
enlace de YouTube**; el audio se procesa con el **software seleccionado**; se muestran
resultados (análisis, stems, MIDI) comparables entre engines.

### 2.1 Ingesta
- Upload de audio (mp3/wav/flac/m4a/ogg) → `storage` (`users/{uid}/audio/{job}/input.*`).
- YouTube: `yt-dlp` en el `audio-worker` extrae el audio a wav/mp3.
  ⚠️ Nota legal/ToS: solo para pruebas con contenido propio o permitido; documentarlo.
- Normalización con `ffmpeg` (ya presente) a un wav canónico (44.1k/mono o estéreo según engine).

### 2.2 Orquestación
- `POST /api/audio/jobs` `{kind, engine, input_ref|youtube_url, params}` → crea `AudioJob`.
- `GET /api/audio/jobs/{id}` (estado, logs, outputs); `GET /api/audio/jobs` (listado).
- `GET /api/audio/engines` → catálogo (de `describe()` de cada engine: id, kind, needs_gpu,
  params, disponibilidad). Engines no instalados aparecen como *no disponibles*.
- El orquestador encola y el `audio-worker` ejecuta el engine correspondiente.

### 2.3 UI "Audio Lab" (`apps/web/src/pages/AudioLabPage.tsx`)
- Dropzone + campo de URL de YouTube.
- Selector de **tipo** (análisis / separación / transcripción) y de **engine**.
- Panel de progreso (estado del job) + resultados:
  - análisis → tablas/gráficas (tempo, key, beats, loudness, espectrograma).
  - separación → reproductores por stem + descarga.
  - transcripción → descarga `.mid` + botón "Convertir a proyecto Musix" (Fase 6).
- Ruta protegida normal (en dev se entra como admin).

**Entregable (dev):** subir un mp3, lanzar un engine *placeholder* y ver el job completarse
con un artefacto descargable. (Engines reales en Fases 3–5.)

---

## Fase 3 — Engines de análisis (CPU)

**Objetivo.** Análisis de sonido/musical sobre el audio.

- **librosa**: tempo/beats, croma/estimación de tonalidad, RMS/loudness, MFCC,
  espectrograma, onsets. Salida `analysis.json` + imágenes (PNG espectrograma).
- **essentia**: descriptores musicales (key/scale, BPM, danceability, loudness EBU R128,
  embeddings si procede). Salida `analysis.json`.
- Contenedor `audio-worker` (o imagen específica de análisis) con estas deps; ambos
  implementan la interfaz de engine `kind=analysis`.
- UI muestra resultados y permite comparar librosa vs essentia sobre el mismo audio.

**Entregable (dev):** para un mp3, obtener BPM/tonalidad y espectrograma con ambos engines.

---

## Fase 4 — Engines de separación de pistas

**Objetivo.** Separar el audio en stems (voz, batería, bajo, otros…).

- **demucs** (CPU funciona, lento; GPU mucho más rápido): htdemucs por defecto.
- **python-audio-separator** (modelos MDX/UVR vía onnxruntime; CPU razonable):
  varios modelos seleccionables.
- Salida: `stems/{vocals,drums,bass,other}.wav` (+ metadatos del modelo).
- Engines `kind=separation`. GPU opcional (variable `device=cpu|cuda`).
- UI: reproductor por stem, descarga, y "enviar stem a transcripción" (encadenar a Fase 5).

**Entregable (dev, CPU):** separar un mp3 con audio-separator y/o demucs y reproducir stems.

---

## Fase 5 — Engines de transcripción (mp3 → MIDI)

**Objetivo.** Probar varias tecnologías de transcripción a MIDI y compararlas.

Orden por viabilidad en CPU (empezamos por lo ligero):

1. **Basic Pitch** (Spotify, TF/onnx, **CPU-friendly**) — polifónico genérico → `.mid`.
   Primer engine de referencia.
2. **demucs + Basic Pitch encadenado** — transcribir un stem aislado mejora resultados.
3. **SheetSage**, **YourMT3**, **MT3**, **Omnizart** — **pesados / GPU-first** y con
   *dependencias delicadas* (MT3/Omnizart son TF1-era; YourMT3 es torch; SheetSage trae
   su propio stack). Cada uno como **contenedor aislado opcional**, no instalado por
   defecto en dev CPU. Se activan cuando haya GPU (cloud o máquina dedicada).
- Todos exponen `kind=transcription` y devuelven `transcription.mid` (+ métricas).
- Documentar en `docs/AUDIO-ENGINES.md`: requisitos, licencia, GPU sí/no, calidad observada.

**Entregable (dev, CPU):** mp3 → `.mid` con Basic Pitch, descargable y reproducible.
GPU-engines: documentados y con receta de despliegue aparte (diferidos a disponibilidad de GPU).

---

## Fase 6 — Conversión MIDI → proyecto Musix

**Objetivo.** Convertir el `.mid` (de Fase 5 o subido) en un proyecto Musix editable.

- Pipeline: `.mid` → **cuantización** (tempo/compás/duraciones) → **IR Musix** (Fase 1) →
  AlphaTab JSON vía sidecar → guardar como `.mu6` en un proyecto nuevo.
- Librerías candidatas: `pretty_midi`/`mido` para parseo, `music21` o lógica propia para
  cuantizar a rejilla; alternativa: MIDI→MusicXML (MuseScore CLI) e importar por AlphaTab.
  Decidir tras prototipar (la cuantización es la parte difícil).
- Endpoint `POST /api/audio/jobs/{id}/to-project` y/o `POST /api/projects/from-midi`.
- UI: botón "Convertir a proyecto Musix" en resultados de transcripción → abre el editor.

**Entregable (dev):** desde una transcripción, crear un proyecto que abre en el editor con
compases/notas razonables y suena.

---

## Fase 7 — Asistente IA agéntico (DIFERIDO, documentado)

> No crucial ahora; se documenta el diseño para abordarlo más adelante.

**Objetivo.** Un asistente que usa la API (Fases 1–6) como *tools* para ayudar al usuario y
ejecutar tareas avanzadas (componer/editar partituras, lanzar análisis/transcripción,
convertir a proyecto, etc.).

### 7.1 Autenticación del LLM — OAuth de Claude Code y Codex (soportar ambos)
- Aprovechar la **suscripción del usuario** vía OAuth (Claude Code / Codex) en lugar de
  API keys de pago. Diseño:
  - **Gateway LLM** en `api` con interfaz de proveedor (`provider=claude|codex`).
  - Flujo OAuth por proveedor: alta de credenciales, *refresh* de tokens, almacenamiento
    seguro (no en cliente). Investigar el alcance soportado por cada OAuth para uso
    programático (límites de ToS) y documentarlo antes de implementar.
  - Abstracción de "chat con tools" común a ambos proveedores (normalizar el formato de
    *tool calling* de cada uno).

### 7.2 Tools y flujo agéntico
- Las operaciones de la **Score API** (Fase 1, manifiesto de tools ya generado) +
  **Audio API** (Fases 2–6) se exponen como herramientas.
- **System prompt** con: modelo de datos de la IR, invariantes musicales, catálogo de
  instrumentos/engines, y guía de uso de tools.
- **Loop agéntico**: el modelo planifica → llama tools → observa resultados (validación del
  sidecar, estados de jobs) → itera. Límites de pasos/coste y trazas para depurar.
- **UI de chat** integrada en el editor (acciones del asistente reflejadas en la partitura
  en vivo).

### 7.3 Seguridad
- Las tools operan **solo** sobre recursos del usuario autenticado.
- Validación estricta de argumentos (reutiliza validación de la Score API).
- En modo local sin login, el asistente actúa como admin (igual que el resto).

---

## Secuenciación y entregables

| Fase | Depende de | Entregable verificable en `dev` |
|---|---|---|
| Fundaciones | — | Modelo/repos `AudioJob`, storage de audio, worker básico |
| 1 Score API | sidecar | Crear/editar partitura por API → renderiza y suena |
| 2 Audio Lab | Fundaciones | Subir mp3 / YouTube → job con artefacto |
| 3 Análisis | 2 | BPM/tonalidad/espectrograma (librosa + essentia) |
| 4 Separación | 2 | Stems reproducibles (audio-separator/demucs, CPU) |
| 5 Transcripción | 2 (4 opc.) | mp3 → `.mid` (Basic Pitch CPU); pesados documentados |
| 6 MIDI→Musix | 1, 5 | Transcripción → proyecto editable |
| 7 Asistente IA | 1–6 | (Diferido) chat con tools sobre OAuth Claude/Codex |

**Estrategia:** Fase 1 y Fundaciones pueden ir en paralelo. Fases 3–5 son incrementales
sobre la 2 (cada engine es una PR aislada). Probar cada fase en `dev` antes de plantear su
promoción a `main`.

## Riesgos y preguntas abiertas

- **Dependencias ML en conflicto** (TF1 vs torch vs onnx) → aislar por contenedor; nunca
  en `api`. MT3/Omnizart pueden ser inviables sin entorno legacy/GPU.
- **CPU**: separación y transcripción pesada serán lentas; validamos pipeline con engines
  ligeros y dejamos GPU para cuando esté disponible.
- **Cuantización MIDI→partitura**: principal reto de calidad de la Fase 6.
- **YouTube/ToS**: uso solo para pruebas permitidas; documentar.
- **OAuth Claude/Codex para uso programático** (Fase 7): confirmar viabilidad/ToS y modelo
  de tokens antes de comprometer diseño.
- **Broker de jobs** (simple vs Redis/Celery): decidir al iniciar Fase 2 según concurrencia.
