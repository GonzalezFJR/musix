// Acordes de Musix. Un acorde es texto mostrado sobre el beat ("C", "Am7", "Do",
// "Lam7"…). Soportamos dos notaciones del nombre de la fundamental:
//   - americana: C C# D D# E F F# G G# A A# B
//   - española:  Do Do# Re Re# Mi Fa Fa# Sol Sol# La La# Si
// El SUFIJO de calidad (m, 7, maj7…) es idéntico en ambas notaciones, así que al
// cambiar de notación solo se reescribe la fundamental. Un acorde "personalizado"
// es texto libre: la app no lo interpreta ni lo traduce.
//
// Codificamos el acorde en su id (clave en staff.chords y beat.chordId):
//   - conocido:        "k:<root 0-11>:<qualityKey>"
//   - personalizado:   "x:<texto>"
// Como el id contiene toda la info, basta releerlo para reconstruir el nombre en
// cualquier notación (no hace falta estado paralelo).

export type ChordNotation = "american" | "spanish";

export const NOTATION_OPTIONS: { value: ChordNotation; label: string }[] = [
  { value: "american", label: "Americana (C, D, E…)" },
  { value: "spanish", label: "Española (Do, Re, Mi…)" },
];

const ROOTS: Record<ChordNotation, string[]> = {
  american: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  spanish: ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"],
};

export interface ChordQuality {
  key: string; // identificador estable en el id
  suffix: string; // se añade tras la fundamental ("", "m", "7"…)
  label: string; // etiqueta legible en el selector
}

export const QUALITIES: ChordQuality[] = [
  { key: "maj", suffix: "", label: "Mayor" },
  { key: "min", suffix: "m", label: "menor (m)" },
  { key: "7", suffix: "7", label: "7" },
  { key: "maj7", suffix: "maj7", label: "Maj7" },
  { key: "m7", suffix: "m7", label: "m7" },
  { key: "6", suffix: "6", label: "6" },
  { key: "m6", suffix: "m6", label: "m6" },
  { key: "dim", suffix: "dim", label: "dim" },
  { key: "dim7", suffix: "dim7", label: "dim7" },
  { key: "m7b5", suffix: "m7b5", label: "m7♭5" },
  { key: "aug", suffix: "aug", label: "aug (+)" },
  { key: "sus2", suffix: "sus2", label: "sus2" },
  { key: "sus4", suffix: "sus4", label: "sus4" },
  { key: "9", suffix: "9", label: "9" },
  { key: "m9", suffix: "m9", label: "m9" },
  { key: "maj9", suffix: "maj9", label: "Maj9" },
  { key: "add9", suffix: "add9", label: "add9" },
  { key: "7sus4", suffix: "7sus4", label: "7sus4" },
];

const QUALITY_BY_KEY = new Map(QUALITIES.map((q) => [q.key, q]));

export function rootName(root: number, notation: ChordNotation): string {
  return ROOTS[notation][((root % 12) + 12) % 12];
}

export function knownChordId(root: number, qualityKey: string): string {
  return `k:${((root % 12) + 12) % 12}:${qualityKey}`;
}
export function customChordId(text: string): string {
  return `x:${text}`;
}

export type ChordSpec =
  | { kind: "known"; root: number; quality: string }
  | { kind: "custom"; text: string };

export function parseChordId(id: string | null | undefined): ChordSpec | null {
  if (!id) return null;
  if (id.startsWith("k:")) {
    const [, root, quality] = id.split(":");
    return { kind: "known", root: Number(root), quality };
  }
  if (id.startsWith("x:")) {
    return { kind: "custom", text: id.slice(2) };
  }
  // id heredado/desconocido → trátalo como personalizado con el propio id.
  return { kind: "custom", text: id };
}

/** Nombre a mostrar para un id de acorde en la notación dada. */
export function chordDisplay(id: string | null | undefined, notation: ChordNotation): string {
  const spec = parseChordId(id);
  if (!spec) return "";
  if (spec.kind === "custom") return spec.text;
  const q = QUALITY_BY_KEY.get(spec.quality);
  return rootName(spec.root, notation) + (q ? q.suffix : "");
}
