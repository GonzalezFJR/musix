// Utilidades de altura para el cursor de edición sobre el pentagrama.
//
// El pentagrama coloca las cabezas de nota por POSICIÓN DIATÓNICA (línea/espacio),
// no cromática: subir un paso = siguiente letra (Do→Re→Mi…). Codificamos esa posición
// como un "paso diatónico" entero: paso = octava*7 + índiceLetra (Do=0 … Si=6).
// La altura MIDI concreta de cada paso depende de la tonalidad (sus sostenidos/bemoles).

// Clase de altura (0..11) → índice de letra (Do=0 … Si=6).
const SHARP_PC_LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // Do Do# Re Re# Mi Fa Fa# Sol Sol# La La# Si
const FLAT_PC_LETTER = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]; //  Do Reb Re Mib Mi Fa Solb Sol Lab La Sib Si
// Semitono natural de cada letra (Do Re Mi Fa Sol La Si).
const LETTER_SEMI = [0, 2, 4, 5, 7, 9, 11];
// Orden de alteraciones por el círculo de quintas, como índices de letra.
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // Fa Do Sol Re La Mi Si
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; //  Si Mi La Re Sol Do Fa

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Paso diatónico (octava*7 + letra) de una altura MIDI dada en la tonalidad. */
export function diatonicStepFromMidi(midi: number, keySig: number): number {
  const pc = mod(midi, 12);
  const octave = Math.floor(midi / 12) - 1;
  const letter = keySig < 0 ? FLAT_PC_LETTER[pc] : SHARP_PC_LETTER[pc];
  return octave * 7 + letter;
}

/** Altura MIDI de un paso diatónico, aplicando las alteraciones de la tonalidad. */
export function midiFromDiatonicStep(step: number, keySig: number): number {
  const letter = mod(step, 7);
  const octave = Math.floor(step / 7);
  let midi = (octave + 1) * 12 + LETTER_SEMI[letter];
  if (keySig > 0 && SHARP_ORDER.slice(0, keySig).includes(letter)) midi += 1;
  else if (keySig < 0 && FLAT_ORDER.slice(0, -keySig).includes(letter)) midi -= 1;
  return midi;
}

// Nombres de nota en notación latina (Do Re Mi…), con sostenidos.
const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];

/** Nombre de nota latino con octava (p. ej. "La5") para una altura MIDI. */
export function midiToName(midi: number): string {
  const pc = mod(midi, 12);
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}
