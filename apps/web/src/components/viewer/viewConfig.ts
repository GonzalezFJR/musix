// Configuración de vista de la partitura (customización del usuario).

export type FrameKind = "extended" | "central" | "folio";
export type Orientation = "portrait" | "landscape";
export type Alignment = "normal" | "ordered";
/** Modo de visualización: partitura (AlphaTab) o letra (acordes + letra). */
export type ViewMode = "score" | "lyrics";
/** Cómo se calculan los saltos de línea en la vista de letra. */
export type LyricsBreakMode = "every" | "custom";

export interface LyricsConfig {
  /** Salto de línea automático cada N compases. */
  barsPerLine: number;
  /** "every": cada N compases. "custom": el usuario edita saltos individuales. */
  breakMode: LyricsBreakMode;
  /** En modo "custom": índices de compás (base 0) que INICIAN una línea nueva. */
  customBreaks: number[];
}

export interface ViewConfig {
  /** Modo de visualización: partitura o letra. */
  mode: ViewMode;
  /** Marco: extendido (ancho completo), central (con márgenes) o folio. */
  frame: FrameKind;
  /** Orientación del folio. */
  orientation: Orientation;
  /** Alineación de compases: normal (auto) u ordenada (N por fila). */
  alignment: Alignment;
  /** Compases por fila cuando la alineación es "ordenada". */
  barsPerRow: number;
  /** Configuración propia de la vista de letra. */
  lyrics: LyricsConfig;
}

export const DEFAULT_LYRICS: LyricsConfig = {
  barsPerLine: 2,
  breakMode: "every",
  customBreaks: [],
};

export const DEFAULT_VIEW: ViewConfig = {
  mode: "score",
  frame: "extended",
  orientation: "portrait",
  alignment: "normal",
  barsPerRow: 4,
  lyrics: DEFAULT_LYRICS,
};

// ── Disposición de paneles (customización del usuario) ───────────
// El usuario decide en qué región vive cada bloque. Una región (izquierda,
// derecha, inferior) solo aparece si tiene algún bloque con contenido; así no
// hace falta activar/desactivar barras por separado: se crean al colocar bloques.
export type Region = "left" | "right" | "bottom" | "hidden";
export type BlockId = "tools" | "tracks" | "scales";

// Cómo se visualiza el bloque "Pistas": lista (con controles) o cronograma de
// cuadrados por compás.
export type TracksView = "list" | "timeline";

export interface LayoutConfig {
  placement: Record<BlockId, Region>;
  tracksView: TracksView;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  placement: { tools: "left", tracks: "left", scales: "right" },
  tracksView: "list",
};

// Orden estable de los bloques al apilarlos en una región.
export const BLOCK_ORDER: BlockId[] = ["tools", "tracks", "scales"];
export const BLOCK_LABELS: Record<BlockId, string> = {
  tools: "Herramientas",
  tracks: "Pistas",
  scales: "Escalas",
};
export const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "left", label: "Izquierda" },
  { value: "right", label: "Derecha" },
  { value: "bottom", label: "Abajo" },
  { value: "hidden", label: "Oculto" },
];

const LAYOUT_KEY = "musix_layout";
const VIEW_KEY = "musix_view";

export function loadLayout(): LayoutConfig {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LayoutConfig>;
      // Merge PROFUNDO de placement: un layout guardado antiguo puede no tener
      // bloques nuevos (p. ej. "scales") → deben heredar su región por defecto.
      return {
        ...DEFAULT_LAYOUT,
        ...parsed,
        placement: { ...DEFAULT_LAYOUT.placement, ...(parsed.placement ?? {}) },
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT;
}
export function saveLayout(l: LayoutConfig) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}
export function loadView(): ViewConfig {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ViewConfig>;
      return { ...DEFAULT_VIEW, ...parsed, lyrics: { ...DEFAULT_LYRICS, ...(parsed.lyrics ?? {}) } };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_VIEW;
}
export function saveView(v: ViewConfig) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

// Dimensiones de folio a ~96 dpi (aprox. A4).
const A4 = { short: 794, long: 1123 };
export function pageDims(o: Orientation) {
  return o === "portrait"
    ? { width: A4.short, height: A4.long }
    : { width: A4.long, height: A4.short };
}

/** Clase CSS del contenedor interior de la partitura. */
export function frameClass(v: ViewConfig): string {
  switch (v.frame) {
    case "central":
      return "mx-auto max-w-[1000px] rounded-md bg-[#fbfaf7] p-8 shadow-md";
    case "folio":
      return "mx-auto my-6 bg-white p-12 shadow-xl";
    default:
      return "min-h-full bg-[#f7f6f3] p-4";
  }
}
