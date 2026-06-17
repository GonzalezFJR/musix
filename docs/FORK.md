# Fork de AlphaTab (control fino de edición)

Para lograr edición fina (render incremental, hooks de edición, cursor real sobre el
pentagrama) trabajamos sobre un **fork del código fuente TypeScript de AlphaTab**, en
lugar de depender del paquete npm publicado. AlphaTab está escrito en TypeScript (se
transpila a C#/Kotlin para otras plataformas), así que para web trabajamos en su mismo
lenguaje.

## Licencia

AlphaTab es **MPL-2.0** (copyleft a nivel de fichero). Podemos modificarlo y combinarlo
con nuestro código propietario (en ficheros separados). Obligación: publicar el código
fuente de los ficheros de AlphaTab que modifiquemos. Vendorizamos el fuente del fork en
`vendor/alphatab/` (partiendo del tag **v1.8.3** de upstream), de modo que las
modificaciones quedan publicadas junto al resto del proyecto y satisfacen esa obligación.

> Aviso del autor: el código fuente pide expresamente no quitar el texto "rendered by
> alphaTab" sin permiso. Es una petición de cortesía (no un requisito de la licencia).
> **Decisión de producto pendiente.** Mantenemos la atribución a AlphaTab en el
> README/créditos.

## Ubicación

- `vendor/alphatab/` — clon de [CoderLine/alphaTab](https://github.com/CoderLine/alphaTab)
  en el tag **v1.8.3** (la versión que usábamos del npm). Monorepo con workspaces; el
  paquete web es `packages/alphatab`.

## Flujo de trabajo

1. Edita la fuente en `vendor/alphatab/packages/alphatab/src/`.
2. Compila y empaqueta:
   ```bash
   ./scripts/build-alphatab-fork.sh
   ```
   Esto: instala deps (1ª vez), compila (`vite build` esm+umd), empaqueta con `npm pack`
   y copia el tarball a `apps/web/alphatab-fork.tgz`.
3. Reconstruye la web:
   ```bash
   docker compose up -d --build web
   ```

`apps/web/package.json` depende de `@coderline/alphatab` vía `file:alphatab-fork.tgz`, así
que el build (local y Docker) consume **nuestra** versión.

## Edición fina: hallazgos clave (verificados con Playwright)

- **`core.includeNoteBounds: true` es imprescindible.** AlphaTab solo dispara
  `noteMouseDown` (identificar la nota bajo el cursor) si está activo
  (`AlphaTabApiBase._setupClickHandling`). Sin él, clicar una nota solo selecciona el
  beat → no se podía editar la altura. Activado en `ScoreViewer`.
- **Render incremental (ya soportado en upstream 1.8.3).** Se invoca con
  `api.render({ firstChangedMasterBar, reuseViewport: true })`:
  - `firstChangedMasterBar` → `VerticalLayoutBase.doUpdateForBars` re-maqueta solo
    desde ese compás hasta el final, reutilizando (`reregisterPartial`) los sistemas
    anteriores sin repintarlos. **Requiere `enableLazyLoading` (por defecto true).**
  - `reuseViewport` → la fachada (`BrowserUiFacade.beginUpdate/AppendRenderResults`)
    intercambia el contenido del chunk de forma **atómica** (`innerHTML = body`) sin
    vaciarlo antes → **sin flash blanco**.
  - En `ScoreViewer.refresh()` pasamos el master-bar del beat editado como hint.
  - El scroll se preserva con `pinScroll` (reafirma la posición varios frames, porque
    el lazy-loading renderiza chunks posteriores tras `postRenderFinished`).

## Cursor de pitch + creación de elementos (verificado con Playwright)

- **Mapeo línea/espacio ↔ altura.** El pentagrama coloca por posición DIATÓNICA
  (cada paso línea↔espacio = `staffHeight/8`). El módulo `lib/pitch.ts` convierte
  altura↔paso diatónico respetando la tonalidad. La Y se ancla en una nota real del
  mismo sistema; la altura ESCRITA = `realValue − staff.displayTranspositionPitch`
  (¡ojo con instrumentos transpositores, p. ej. flauta una octava abajo!).
- **Colisión de IDs al crear elementos (gotcha importante).** `findBeat`/note-bounds
  del `BoundsLookup` se indexan por `beat.id`/`note.id`. La deserialización CONSERVA
  los ids del fichero, pero el contador interno (`Beat._globalBeatId`) NO se adelanta,
  así que `new Beat()`/`new Note()` reciben ids que **colisionan** con los existentes
  → el cursor/overlay aparece en el compás equivocado. **Siempre** asignar a los
  elementos nuevos un id por encima del máximo existente (ver `maxBeatId`/`maxNoteId`
  en `ScoreViewer`).
- **Cambios estructurales ≠ render parcial.** Añadir/quitar compases debe usar render
  completo (`refresh(beat, { full: true })`): el parcial asume que el sistema ya existe
  en `_systems` y deja el `BoundsLookup` inconsistente para compases nuevos.

## Editor avanzado (implementado y verificado E2E)

Panel "Herramientas" en la barra lateral (visible al seleccionar un beat):
- **Dinámica** `beat.dynamics` (pp p mp mf f ff).
- **Tresillo** `beat.tupletNumerator/Denominator` = 3/2 (toggle).
- **Ligadura** `note.isTieDestination` en el beat siguiente (crea la nota destino con la
  misma altura si no existe).
- **Clave** `bar.clef`, **Tonalidad** `bar.keySignature`, **Métrica**
  `masterBar.timeSignature*` — se **propagan de ese compás en adelante** hasta el
  siguiente cambio (convención musical), no a un compás aislado.
- **Compases incompletos en rojo**: overlay calculado en `postRenderFinished`
  comparando la suma de `beat.playbackDuration` de la voz con
  `masterBar.calculateDuration(false)` (capacidad de la métrica).
- **Crescendo/diminuendo** `beat.crescendo`. **Puntillo** `beat.dots` (botón + tecla `.`,
  y puntillo activo al colocar). **Repetición** `masterBar.isRepeatStart`/`repeatCount`.
  **Vueltas** `masterBar.alternateEndings` (bitmask 1ª/2ª). **Marcas** `masterBar.directions`
  (Segno, Coda, Fine, Da Capo, D.C./D.S. al Fine/Coda…).
- **OJO `hideDynamics`:** muchos `.gp` traen `score.stylesheet.hideDynamics = true`, lo que
  oculta TODAS las dinámicas aunque el modelo cambie. Lo forzamos a `false` en `scoreLoaded`.

## Objetivos del fork (hoja de ruta)

1. ~~**Render incremental**~~ ✅ Hecho vía `firstChangedMasterBar` + `reuseViewport`.
   Mejora futura posible (ver comentario en `doUpdateForBars`): cuando la edición no
   cambia el ancho del compás, repintar **solo ese sistema** en vez de re-maquetar
   hasta el final.
2. **Hooks de edición** — mutar el modelo y recalcular un solo compás de forma limpia.
3. **Cursor de edición real** — mapear línea/espacio del pentagrama ↔ pitch con precisión,
   crear notas a la altura del cursor.

## Sincronización con upstream

El fork está en el tag v1.8.3. Para traer cambios de upstream: `git fetch` en
`vendor/alphatab` y rebase/merge de nuestras modificaciones. Conviene contribuir de vuelta
las mejoras no propietarias (p. ej. render incremental) para reducir el mantenimiento.
