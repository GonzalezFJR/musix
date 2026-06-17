# Instrumentos realistas + Exportar a MP3 — Estudio de viabilidad y plan

Objetivo: permitir al usuario **asignar un instrumento realista a cada pista** (con bancos
de sonido open-source de licencia permisiva) y **exportar a MP3** una mezcla renderizada con
esos sonidos.

## TL;DR / Recomendación

- **Renderizado en el servidor**, no en el navegador. El navegador (AlphaSynth) solo soporta
  SF2/SF3 y no escala con librerías grandes; la calidad realista (sobre todo SFZ) exige un
  motor nativo.
- **Tubería**: AlphaTab `MidiFileGenerator` → MIDI por pista → render por motor
  (FluidSynth para SF2/SF3, sfizz para SFZ) → mezcla (volumen/pan ya modelados) con
  `ffmpeg` → MP3.
- **Empezar simple (máximo valor / mínimo riesgo)**: FluidSynth + **MuseScore General
  (SF3, MIT, ~30 MB)** cubre todos los instrumentos GM con calidad decente en una sola
  pasada. Añadir SFZ realistas por fases.
- **La previsualización en vivo seguirá usando el SF2 actual** (aproximada); el MP3 usa los
  sonidos buenos. Hay que comunicarlo en la UI.
- Servicio de render **en un contenedor aparte** (deps pesadas + límites de recursos),
  trabajo **asíncrono** con cola, **caché** por hash y **auth + rate-limit**.

---

## 1. Arquitectura

```
Navegador (React)                    Backend (FastAPI)            Render worker (contenedor)
  asigna instrumento/pista   ─POST─► crea job (DB)        ─cola─►  fluidsynth / sfizz_render
  "Exportar MP3" (mezcla)            score JSON + map              → WAV por pista
  poll estado / descarga    ◄──────  /export/{job} estado          → ffmpeg mix + loudnorm → MP3
                            ◄──────  MP3 (volumen file-data)        guarda en /data/files
```

- **MIDI**: ya sabemos generarlo (ver `MidiExportModal`): `MidiFileGenerator` sobre una copia
  del `Score`. Para el render por pista, generamos un MIDI por pista (o uno multicanal y
  separamos por canal).
- **Motores**:
  - **FluidSynth** (LGPL-2.1): SF2/SF3. Una sola pasada multicanal con `program` por canal.
    Maduro, rápido en offline. `apt install fluidsynth`.
  - **sfizz** (BSD-2): librerías **SFZ** (la mayoría de las listadas). CLI `sfizz_render`
    (MIDI + .sfz → WAV).
  - **MeltySynth** (MIT) es C#; sin binding Python mantenido → se descarta en servidor a
    favor de FluidSynth. (Útil solo si algún día se quiere render en cliente con WASM.)
- **Mezcla / codificación**: `ffmpeg` (LAME) — mezcla `amix`, ganancia/pan por pista,
  `loudnorm`/`alimiter` para evitar clipping, export MP3 (bitrate elegible).

### Estrategias de render
- **Solo SF2/SF3** (MVP): una pasada de FluidSynth, `program`/`bank` por canal → WAV → MP3.
  Simple y barato.
- **SFZ o mixto**: render **por pista** (sfizz para SFZ, fluidsynth para SF2) → mezcla con
  ffmpeg aplicando volumen/pan. Más costoso pero permite librerías realistas heterogéneas.

---

## 2. Catálogo de instrumentos y formatos

| Librería | Formato | Tamaño aprox. | Licencia (verificar) | Notas |
|---|---|---|---|---|
| **MuseScore General** | SF3 | ~30 MB | MIT | **Fallback GM completo**. Empezar aquí. |
| VSCO 2 Community Ed. | SFZ/SF2 | cientos MB–GB | CC0 | Orquesta. Pesado; elegir subset. |
| Versilian VCSL / Keys | SFZ | ~GB | CC0 | Amplio; subset. |
| Salamander/Accurate Grand | SFZ | ~1 GB (48k) | CC-BY 3.0 | Piano de referencia. Atribución. |
| YDP Grand Piano | SFZ/SF2 | ~ cientos MB | CC-BY/SA | Piano. Atribución. |
| MuldjordKit | SFZ (orig. DrumGizmo) | ~GB | CC-BY | Batería. Atribución. |
| FreePats (Upright KW, Spanish Classical Guitar, FSBS Electric, Muldjord) | SFZ | varía | **CC0 / CC-BY / GPL según pack** | Verificar por paquete. |
| Karoryfer (Emilyguitar, Growlybass…) | SFZ | varía | **Licencia propia Karoryfer** | Permisiva pero **leer términos de redistribución**. |
| Univ. Iowa MIS | WAV crudos | grande | Dominio público (uso libre) | **Hay que empaquetar a SFZ** (esfuerzo). |

> La mayoría son **SFZ** → sfizz es imprescindible para la fase realista. **MuseScore
> General (SF3)** da cobertura inmediata con FluidSynth y casi sin riesgo.

**Registro de instrumentos** (estático, servido por `GET /instruments`):
```
{ id, name, family, engine: "sf2"|"sfz", file, bank?, program?, sampleRate, license, attribution, sizeMB }
```
El frontend agrupa por familia y ofrece un instrumento por pista (por defecto, el programa
GM que ya trae la pista).

---

## 3. Riesgos y mitigaciones

### Legales (los más delicados)
- **Atribución (CC-BY)**: Salamander, MuldjordKit, YDP y varios FreePats exigen crédito →
  **página/fichero de créditos** (NOTICE) con cada librería usada en una exportación, y
  metadatos en el MP3 (tag `comment`).
- **Licencias propias (Karoryfer)**: permiten uso, pero **revisar redistribución**: hostear
  los samples en nuestra imagen/volumen es "redistribuir". Mantener el texto de licencia y,
  si la licencia lo restringe, **no bundlear**: descargar bajo demanda desde el origen.
- **GPL en datos (algunos FreePats)**: el audio resultante no es obra derivada del código,
  pero **bundlear** datos GPL obliga a acompañar licencia/oferta de fuente. Mantener LICENSE.
- **CC0** (VSCO2 CE, VCSL): sin obligación; aun así, créditos de cortesía.
- **Acción**: verificación **por paquete** antes de incluirlo; guardar el texto de licencia
  junto al banco; decidir *bundled* vs *descarga opcional*; NOTICE agregado.

### Almacenamiento / tamaño
- Librerías realistas = **GB**. No meterlas en la imagen Docker.
- Mitigación: **volumen `soundbanks` dedicado**, poblado por un script de `setup` que
  descarga de upstream (no en git). Curar **subsets compactos**. Posible object storage.

### Cómputo / memoria
- SFZ con muchos samples → mucha RAM al cargar; render CPU-intensivo.
- Mitigación: render **offline** (más rápido que tiempo real), **concurrencia limitada**
  (1–2 jobs simultáneos), **timeout** y **límites de memoria** del contenedor, **caché** del
  MP3 por `hash(score + map + mezcla + bitrate)`.

### Concurrencia / abuso
- Endpoint caro → **requiere auth** (reactivar login), **rate-limit por usuario**, límites de
  nº de pistas/duración, longitud máxima de cola.

### Integración
- Mapeo MIDI program/canal, **canal 10 = batería**, cambios de tempo (los maneja el MIDI),
  staging de ganancia al mezclar muchas pistas (limiter).
- Mitigación: reutilizar `MidiFileGenerator`; **MVP SF2 una pasada**; SFZ multi-pasada después.

### Discrepancia preview vs export
- Live = SF2 aproximado; MP3 = realista. Avisar en UI; ofrecer "previsualizar MP3".

### Ops / build
- Añadir `fluidsynth`, `sfizz`, `ffmpeg`. Mejor en un **servicio `render` separado** (imagen
  propia, límites de CPU/RAM), compartiendo `file-data` + volumen `soundbanks`.

---

## 4. Cambios por componente

- **docker-compose**: nuevo servicio `render` (fluidsynth + sfizz + ffmpeg), volúmenes
  `file-data` (compartido) y `soundbanks`. Límites `deploy.resources`/`mem_limit`.
- **Backend (FastAPI)**:
  - `GET /instruments` (catálogo).
  - `POST /projects/{id}/export/mp3` → crea job `{ instrumentMap, mix, bitrate, format }`.
  - `GET /export/{job}` → estado (`queued|running|done|error`) + URL de descarga.
  - Modelo `RenderJob` (DB) + worker (proceso/cola; MVP: `BackgroundTasks` + lock global o
    cola simple; Fase 3: RQ/Celery/arq).
  - Caché por hash; limpieza de temporales.
- **Worker render**: recibe score JSON + map → genera MIDI(s) → fluidsynth/sfizz → ffmpeg →
  MP3 en `file-data` → marca job.
  - Para generar el MIDI fuera del navegador: o bien el **frontend envía el MIDI ya generado**
    por AlphaTab (reutiliza `MidiFileGenerator`, evita reimplementar en Python), o se genera
    en backend. **Recomendado: el frontend manda el MIDI** (uno por pista o multicanal).
- **Frontend (React)**:
  - Asignación de instrumento por pista (en panel Pistas o modal "Instrumentos"): selector
    agrupado por familia desde `GET /instruments`; por defecto el GM de la pista.
  - "Exportar MP3" (estilo `MidiExportModal`): selección de pistas + mezcla + instrumento por
    pista + bitrate → crea job, muestra progreso, descarga.
  - Persistir el mapa instrumento/pista por proyecto (MVP: localStorage; mejor: campo DB que
    viaje con el proyecto).
  - Créditos/atribución visibles cuando se usan librerías CC-BY.

---

## 5. Plan por fases

- **Fase 0 — Spike (validación)**: servicio `render` con FluidSynth + **MuseScore General
  SF3** + ffmpeg. Frontend envía MIDI multicanal (todas las pistas, programas GM) →
  WAV → MP3 síncrono (canciones cortas). Botón "Exportar MP3 (beta)". Medir calidad y
  tiempos.
- **Fase 1 — Por pista (SF2/SF3)**: catálogo basado en presets de MuseScore General;
  asignación de instrumento por pista; aplicar mezcla (vol/pan); persistencia del mapa.
- **Fase 2 — SFZ realista**: integrar **sfizz**; curar subset CC0/CC-BY (VSCO2 cuerdas,
  Salamander piano, MuldjordKit batería, guitarra clásica FreePats); render por pista +
  mezcla ffmpeg; volumen `soundbanks` + script de descarga; **página de créditos**.
- **Fase 3 — Robustez**: cola asíncrona real, caché, límites de recursos, rate-limit,
  `loudnorm`/limiter, (opcional) reverb send. Previsualización de MP3.
- **Pista legal (en paralelo)**: verificación por paquete, NOTICE agregado, textos de
  licencia junto a los bancos, decisión *bundled* vs *descarga opcional* (Karoryfer/GPL).

---

## 6. Decisiones abiertas (para el usuario)
1. ¿MIDI generado en **frontend** (reutiliza AlphaTab, recomendado) o en **backend**?
2. ¿Empezar por **Fase 0** (SF2 una pasada, rápido) y luego SFZ — o ir directo a SFZ?
3. ¿Bancos **bundled** en un volumen poblado por `setup`, o **descarga bajo demanda**?
4. Alcance inicial de instrumentos (p. ej. piano, guitarra clásica, cuerdas, batería).
