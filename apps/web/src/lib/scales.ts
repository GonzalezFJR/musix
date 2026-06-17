// Escalas y tonalidades de Musix. Una "escala" = tónica (clase de altura 0-11) +
// modo (mayor/menor + modos griegos). Se asigna a RANGOS de compases como metadato
// (no altera la partitura por sí sola); sirve para colorear zonas y para transponer.
//
// El nombre se muestra en la notación de acordes del usuario (americana/española)
// reutilizando rootName() de chords.ts: la tónica se reescribe, el sufijo del modo
// es idéntico en ambas notaciones.
import { rootName, type ChordNotation } from "./chords";

export type ModeKey =
  | "ionian"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "aeolian"
  | "locrian";

export interface ModeInfo {
  key: ModeKey;
  /** Etiqueta para el selector. */
  label: string;
  /** Sufijo compacto tras la tónica para etiquetas de zona ("", "m", " dór."…). */
  suffix: string;
  /** Desplazamiento en quintas respecto al jónico (define la armadura del modo). */
  fifthsOffset: number;
}

// Orden de presentación: primero mayor y menor (los más usados), luego el resto.
export const MODES: ModeInfo[] = [
  { key: "ionian", label: "Mayor", suffix: "", fifthsOffset: 0 },
  { key: "aeolian", label: "menor", suffix: "m", fifthsOffset: -3 },
  { key: "dorian", label: "Dórico", suffix: " dór.", fifthsOffset: -2 },
  { key: "phrygian", label: "Frigio", suffix: " frig.", fifthsOffset: -4 },
  { key: "lydian", label: "Lidio", suffix: " lid.", fifthsOffset: 1 },
  { key: "mixolydian", label: "Mixolidio", suffix: " mixol.", fifthsOffset: -1 },
  { key: "locrian", label: "Locrio", suffix: " locr.", fifthsOffset: -5 },
];

/** Asignación de una escala a un rango de compases (índices 0-based, inclusivos). */
export interface ScaleAssignment {
  startBar: number;
  endBar: number;
  tonic: number; // clase de altura 0-11
  mode: ModeKey;
}

const MODE_BY_KEY = new Map(MODES.map((m) => [m.key, m]));
export function modeInfo(key: ModeKey): ModeInfo {
  return MODE_BY_KEY.get(key) ?? MODES[0];
}

// Armadura (sostenidos +, bemoles −) de cada tonalidad MAYOR por clase de altura.
// C=0, G=+1 … F#=+6 ; F=−1 … Db=−5. Elección enarmónica convencional (|valor| menor).
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

/** Normaliza una armadura al rango −7..7 (12 quintas = enarmónico). */
function normalizeKeySig(v: number): number {
  let k = v;
  while (k > 7) k -= 12;
  while (k < -7) k += 12;
  return k;
}

/** Armadura (−7..7) correspondiente a una escala (tónica + modo). */
export function keySignatureFor(tonic: number, mode: ModeKey): number {
  const pc = ((tonic % 12) + 12) % 12;
  return normalizeKeySig(MAJOR_FIFTHS[pc] + modeInfo(mode).fifthsOffset);
}

/** Nombre a mostrar de una escala en la notación dada. `full` usa el modo completo. */
export function scaleDisplay(
  tonic: number,
  mode: ModeKey,
  notation: ChordNotation,
  opts?: { full?: boolean },
): string {
  const root = rootName(tonic, notation);
  const m = modeInfo(mode);
  if (opts?.full) {
    // "Do Mayor", "La menor", "Re Dórico"
    return `${root} ${m.label}`;
  }
  return root + m.suffix; // compacto: "Do", "Lam", "Re dór."
}

/**
 * Intervalo MÁS CORTO (en semitonos) para ir de la tónica `from` a `to`.
 * Devuelve un valor en −6..6 (positivo = hacia arriba, negativo = hacia abajo).
 */
export function shortestTranspose(fromTonic: number, toTonic: number): number {
  let d = (((toTonic - fromTonic) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

// ── Gestión de la lista de asignaciones ─────────────────────────────
/** Escala asignada que cubre el compás `bar` (la primera que lo contiene), o null. */
export function scaleAt(list: ScaleAssignment[], bar: number): ScaleAssignment | null {
  return list.find((a) => bar >= a.startBar && bar <= a.endBar) ?? null;
}

/**
 * Asigna `{tonic, mode}` al rango [start,end] recortando/partiendo los solapes
 * existentes, y fusiona zonas contiguas con la misma escala. Devuelve una lista
 * nueva ordenada por compás de inicio (no muta la entrada).
 */
export function setScaleRange(
  list: ScaleAssignment[],
  start: number,
  end: number,
  tonic: number,
  mode: ModeKey,
): ScaleAssignment[] {
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  const out: ScaleAssignment[] = [];
  for (const a of list) {
    if (a.endBar < s || a.startBar > e) {
      out.push({ ...a }); // sin solape
      continue;
    }
    // Parte el tramo que sobresale por la izquierda y/o la derecha.
    if (a.startBar < s) out.push({ ...a, endBar: s - 1 });
    if (a.endBar > e) out.push({ ...a, startBar: e + 1 });
  }
  out.push({ startBar: s, endBar: e, tonic: ((tonic % 12) + 12) % 12, mode });
  out.sort((x, y) => x.startBar - y.startBar);
  // Fusiona contiguas con misma escala.
  const merged: ScaleAssignment[] = [];
  for (const a of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.endBar + 1 === a.startBar && prev.tonic === a.tonic && prev.mode === a.mode) {
      prev.endBar = a.endBar;
    } else {
      merged.push({ ...a });
    }
  }
  return merged;
}

/** Quita la asignación que contiene `bar` (borra la zona completa). */
export function removeScaleAt(list: ScaleAssignment[], bar: number): ScaleAssignment[] {
  return list.filter((a) => !(bar >= a.startBar && bar <= a.endBar));
}

// Paleta estable para colorear zonas. El color depende de tónica+modo, así que la
// misma escala siempre sale del mismo color aunque esté en zonas separadas.
const SCALE_PALETTE = [
  "#2dd4bf", "#a78bfa", "#f472b6", "#fbbf24", "#60a5fa",
  "#34d399", "#f87171", "#c084fc", "#fb923c", "#4ade80",
  "#e879f9", "#22d3ee",
];
export function scaleColor(tonic: number, mode: ModeKey): string {
  const idx = (((tonic % 12) + 12) % 12) + MODES.findIndex((m) => m.key === mode) * 7;
  return SCALE_PALETTE[idx % SCALE_PALETTE.length];
}

// ── Círculo de quintas ──────────────────────────────────────────────
// Tónicas MAYORES en orden de quintas desde Do (12 en punto), en sentido horario.
// La menor relativa de cada una está 3 semitonos por debajo (anillo interior).
export const CIRCLE_MAJOR: number[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
export function relativeMinorTonic(majorTonic: number): number {
  return ((majorTonic - 3) % 12 + 12) % 12;
}
