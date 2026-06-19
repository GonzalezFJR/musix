# Score API — edición programática de partituras

API REST para **crear y editar partituras** de forma granular (pistas, compases,
voces, beats, notas). Diseñada para ser usada por un LLM vía *tools* (Fase 7 del
[roadmap](ROADMAP-DEV.md)), pero es una API normal usable por cualquier cliente.

## Arquitectura

```
Cliente / LLM ──HTTP──> FastAPI /api/score ──subprocess(JSON)──> score-engine (Node)
                              │                                     │ AlphaTab
                              └── storage .mu6 (JSON de AlphaTab) ───┘ (fuente de verdad)
```

- La partitura canónica de un proyecto se guarda como **`.mu6`** = el JSON nativo de
  **AlphaTab**, en `users/{uid}/projects/{pid}/score.mu6` (mismo fichero que abre el
  editor del frontend, vía `GET /api/projects/{id}`).
- **AlphaTab es la fuente de verdad.** Toda mutación pasa por el sidecar
  [`apps/score-engine`](../apps/score-engine) (Node), que carga el modelo de AlphaTab,
  aplica la operación, ejecuta `score.finish()` (valida y recalcula) y re-serializa.
  Si AlphaTab no acepta el resultado, el endpoint responde **400** y no se persiste nada.
- El backend Python (`app/routers/score.py` + `app/services/score_engine.py`) hace
  auth, storage, versionado y traducción de errores; **no** conoce los internos de AlphaTab.

## IR Musix (representación intermedia)

Vista **plana y estable** de la partitura, pensada para que el LLM lea el estado. Es de
**solo lectura** (las mutaciones se hacen con *operaciones*, ver abajo). La devuelve
`GET /api/score/{id}` y todas las mutaciones.

```jsonc
{
  "meta": { "title": "...", "subtitle": "", "artist": "...", "album": "",
            "music": "", "tempo": 120 },
  "tracks": [{
    "index": 0,
    "name": "Pista 1",
    "midiProgram": 0,            // instrumento General MIDI (0-127)
    "isPercussion": false,
    "tuning": [64,59,55,50,45,40], // MIDI por cuerda (vacío = notación estándar)
    "bars": [{
      "index": 0,
      "time": [4, 4],            // [numerador, denominador]
      "section": "Intro",        // opcional (título de sección)
      "voices": [                // lista de voces; cada voz = lista de beats
        [
          { "index": 0, "duration": "quarter", "dots": 0, "rest": false,
            "notes": [ { "pitch": 60, "name": "C4", "string": 1, "fret": 3, "tie": false } ],
            "text": "...", "lyrics": ["la"], "chord": "C", "tuplet": [3,2] },
          { "index": 1, "duration": "quarter", "rest": true, "notes": [] },
          { "index": 0, "empty": true, "rest": true, "notes": [] }  // compás vacío (placeholder)
        ]
      ]
    }]
  }]
}
```

Notas sobre la IR:
- **Direccionamiento por índices**: `track` → `bar` → `voice` → `beat` → `note`.
- `pitch` es el número MIDI (C4 = 60); `name` es informativo. En notas de tablatura
  también vienen `string`/`fret`.
- `empty: true` marca el silencio *placeholder* de un compás vacío; al escribir el primer
  beat real en esa voz, el placeholder se descarta automáticamente.

## Operaciones de edición

Las mutaciones se expresan como **operaciones** `{ "op": "<nombre>", ...args }` y se
envían en lote a `POST /api/score/{id}/ops` (atómico: todo o nada). Lista viva en
`GET /api/score/ops`.

### Pitch y duraciones
- **`pitch`**: número MIDI (`60`) o nombre científico (`"C4"`, `"F#3"`, `"Bb5"`).
- **`duration`**: nombre (`whole, half, quarter, eighth, sixteenth, thirtysecond,
  sixtyfourth, …`) o número (`1, 2, 4, 8, 16, …`). `dots` para puntillos.
- Nota: en pistas con `tuning` (tablatura) puedes usar `{string, fret}`; en notación
  estándar usa `{pitch}`.

### Catálogo de operaciones

| op | args | efecto |
|---|---|---|
| `setMeta` | `title?, subtitle?, artist?, album?, music?, words?, tempo?` | metadatos / tempo |
| `addTrack` | `name?, midiProgram?, tuning?[], percussion?` | añade pista → `{track}` |
| `updateTrack` | `track, name?, midiProgram?, volume?(0-16), balance?, mute?, solo?, tuning?[]` | edita pista |
| `removeTrack` | `track` | elimina pista |
| `appendBar` | `numerator?, denominator?` | añade compás al final → `{bar}` |
| `insertBar` | `at, numerator?, denominator?` | inserta compás → `{bar}` |
| `removeBar` | `index` | elimina compás (en todas las pistas) |
| `setBarTime` | `index, numerator, denominator` | cambia compás de tiempo |
| `setBarSection` | `index, text?, marker?` | título de sección (text vacío = quita) |
| `addBeat` | `track, bar, voice?=0, duration, dots?, rest?, notes?[], text?, lyrics?[], chord?, dynamics?, tuplet?[n,d]` | añade beat → `{beat}` |
| `updateBeat` | `track, bar, voice?, beat, ...(props de beat)` | edita beat |
| `removeBeat` | `track, bar, voice?, beat` | elimina beat |
| `clearBar` | `track, bar, voice?` | vacía el compás (una voz o todas) |
| `addNote` | `track, bar, voice?, beat, pitch? \| (string,fret), tie?, dynamics?` | añade nota → `{note}` |
| `updateNote` | `track, bar, voice?, beat, note, pitch?/string?/fret?, tie?, dynamics?` | edita nota |
| `removeNote` | `track, bar, voice?, beat, note` | elimina nota |

## Endpoints

Todos requieren autenticación y operan sobre proyectos del usuario actual. (En el
despliegue local `dev`, sin login, actúas como admin.)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/score/{id}` | IR + `etag` actual (`has_score=false` si aún no tiene) |
| `POST` | `/api/score/{id}/new` | crea partitura mínima válida (`{meta?, force?}`) |
| `POST` | `/api/score/{id}/ops` | aplica lote de ops (`{ops[], expected_etag?, meta?}`) |
| `GET` | `/api/score/ops` | lista de operaciones soportadas |
| `GET` | `/api/score/health` | disponibilidad del sidecar |

**Respuesta** de `/new` y `/ops`: `{ etag, ir, results }` (`results` = retornos por op,
p. ej. el índice creado).

### Concurrencia (bloqueo optimista)
El `etag` es un hash del `.mu6`. Envía `expected_etag` en `/ops`; si no coincide con el
estado del servidor (alguien editó en medio) → **409 Conflict**. Recarga con `GET` y reintenta.

### Errores
- **400**: AlphaTab rechaza el resultado o la operación es inválida (mensaje legible,
  p. ej. *"No existe la pista 9"*). Pensado para que el LLM se autocorrija.
- **409**: ETag desfasado.
- **503**: el sidecar no está disponible (Node ausente / timeout).

## Ejemplo

```bash
# 1) crear partitura
curl -XPOST .../api/score/$PID/new -d '{"meta":{"title":"Demo","tempo":96}}'
# → { "etag":"ab12…", "ir":{…} }

# 2) componer (do-mi-sol + silencio, añadir compás, pista de bajo)
curl -XPOST .../api/score/$PID/ops -d '{
  "expected_etag":"ab12…",
  "ops":[
    {"op":"setMeta","artist":"Claude"},
    {"op":"addBeat","track":0,"bar":0,"duration":"quarter","notes":[{"pitch":"C4"}]},
    {"op":"addBeat","track":0,"bar":0,"duration":"quarter","notes":[{"pitch":"E4"}]},
    {"op":"addBeat","track":0,"bar":0,"duration":"quarter","notes":[{"pitch":"G4"}]},
    {"op":"addBeat","track":0,"bar":0,"duration":"quarter","rest":true},
    {"op":"appendBar"},
    {"op":"addTrack","name":"Bajo","midiProgram":33,"tuning":[43,38,33,28]}
  ]
}'
```

## Importar MIDI → proyecto (Fase 6)

Dos endpoints crean un proyecto Musix a partir de un MIDI, reutilizando esta Score API
(cuantización a semicorcheas + sidecar AlphaTab):

- `POST /api/projects/from-midi` — multipart con `file` (`.mid/.midi`), `title?`, `folder_id?`.
- `POST /api/audio/jobs/{id}/to-project` — convierte el `.mid` de un job de transcripción.

La conversión (`app/services/midi_convert.py`) es una v1 pragmática: un tempo y un compás,
rejilla de semicorcheas, acordes por onset compartido, sin ligaduras. Es un punto de
partida editable, no una transcripción rítmica exacta.

## Limitaciones actuales / siguientes pasos
- La IR cubre el subconjunto común (notas, duraciones, compases, dinámicas, texto,
  acordes, tresillos, tablatura). Articulaciones avanzadas (bends, slides, efectos) aún no
  se exponen como ops; se editan en el editor visual y **no se pierden** porque las
  mutaciones operan sobre el modelo completo de AlphaTab (no sobre la IR).
- Endpoints REST granulares por recurso (`/tracks`, `/bars`, …) llegarán como envoltura
  fina sobre `/ops`; por ahora `/ops` cubre toda la funcionalidad.
- Manifiesto de *tools* (JSON Schema por op) para el asistente IA: pendiente (Fase 7).

## Desarrollo del sidecar
```bash
cd apps/score-engine && npm install && npm run selftest
echo '{"meta":{"title":"x"}}' | node src/index.mjs new
```
