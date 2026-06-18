// Helpers de construcción del modelo AlphaTab. AlphaTab es la fuente de verdad:
// todo lo que se cree aquí pasa por score.finish() y JsonConverter, de modo que
// solo persistimos partituras que AlphaTab acepta.
import * as at from "@coderline/alphatab";

export const M = at.model;
export const settings = new at.Settings();

// ── Duraciones ───────────────────────────────────────────────────
// El valor del enum Duration coincide con el denominador para las positivas
// (Whole=1, Half=2, Quarter=4, Eighth=8, …). Soportamos nombre o número.
const DURATION_NAMES = {
  whole: 1, half: 2, quarter: 4, eighth: 8, sixteenth: 16,
  thirtysecond: 32, sixtyfourth: 64, onehundredtwentyeighth: 128,
  twohundredfiftysixth: 256, doublewhole: -2, quadruplewhole: -4,
};
const DURATION_VALUES = new Set(Object.values(DURATION_NAMES));

export function parseDuration(d) {
  if (typeof d === "number") {
    if (!DURATION_VALUES.has(d)) throw new Error(`Duración no válida: ${d}`);
    return d;
  }
  if (typeof d === "string") {
    const key = d.toLowerCase().replace(/[^a-z]/g, "");
    if (key in DURATION_NAMES) return DURATION_NAMES[key];
  }
  throw new Error(`Duración no válida: ${JSON.stringify(d)}`);
}

export function durationName(value) {
  for (const [name, v] of Object.entries(DURATION_NAMES)) if (v === value) return name;
  return String(value);
}

// ── Pitch (notación estándar) ────────────────────────────────────
// AlphaTab: Note.realValue (== número MIDI) = octave*12 + tone. Por tanto C4 (MIDI 60)
// → octave=5, tone=0. (El "octave" de AlphaTab no es el científico; difiere en 1.)
const STEP_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiToOctaveTone(midi) {
  return { octave: Math.floor(midi / 12), tone: ((midi % 12) + 12) % 12 };
}

// Acepta MIDI (número) o nombre científico tipo "C#4", "Eb3", "C4".
export function pitchToMidi(pitch) {
  if (typeof pitch === "number") return pitch;
  const m = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(String(pitch).trim());
  if (!m) throw new Error(`Pitch no válido: ${JSON.stringify(pitch)}`);
  const step = STEP_SEMITONE[m[1].toUpperCase()];
  let acc = 0;
  for (const c of m[2]) acc += c === "#" ? 1 : -1;
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + step + acc;
}

// ── Tempo ────────────────────────────────────────────────────────
export function setTempo(score, bpm) {
  if (!score.masterBars.length) return;
  const mb = score.masterBars[0];
  mb.tempoAutomations = [M.Automation.buildTempoAutomation(false, 0, bpm, 2, true)];
}

// ── Master bars ──────────────────────────────────────────────────
export function makeMasterBar(numerator = 4, denominator = 4) {
  const mb = new M.MasterBar();
  mb.timeSignatureNumerator = numerator;
  mb.timeSignatureDenominator = denominator;
  return mb;
}

// ── Pistas ───────────────────────────────────────────────────────
// Crea un Track con un Staff y tantos Bar como masterBars haya. Si `tuning` es un
// array de MIDI → tablatura; si no → notación estándar (pitched).
export function makeTrack(score, { name = "Track", program = 0, tuning = null, percussion = false } = {}) {
  const track = new M.Track();
  track.name = name;
  track.playbackInfo.program = program & 0x7f;
  if (percussion) {
    track.playbackInfo.primaryChannel = 9;
    track.playbackInfo.secondaryChannel = 9;
  }
  const staff = new M.Staff();
  track.addStaff(staff);
  if (Array.isArray(tuning) && tuning.length) {
    staff.stringTuning.tunings = tuning.slice();
    staff.showTablature = true;
    staff.showStandardNotation = true;
  } else {
    staff.showStandardNotation = true;
    staff.showTablature = false;
  }
  // Un Bar por cada masterBar existente.
  for (let i = 0; i < score.masterBars.length; i++) staff.addBar(makeEmptyBar(score, i));
  return track;
}

// Crea un Bar (clef G2 por defecto) con una voz que contiene un silencio
// placeholder. AlphaTab exige ≥1 beat por voz para enlazar (finish falla con voces
// vacías). El placeholder se marca para que la primera escritura real lo reemplace.
export function makeEmptyBar(score, masterBarIndex) {
  const bar = new M.Bar();
  bar.clef = M.Clef.G2;
  const voice = new M.Voice();
  bar.addVoice(voice);
  addPlaceholderRest(voice);
  return bar;
}

export function addPlaceholderRest(voice) {
  const rest = new M.Beat();
  rest.duration = M.Duration.Quarter;
  // isEmpty es la marca NATIVA de AlphaTab para "compás vacío"; sí round-tripea por
  // JSON, así que sobrevive entre invocaciones del sidecar (procesos distintos).
  rest.isEmpty = true;
  voice.addBeat(rest);
}

// True si la voz solo contiene el silencio placeholder de un compás vacío.
export function isPlaceholderVoice(voice) {
  return voice.beats.length === 1 && voice.beats[0].isEmpty;
}

export function ensureVoice(bar, voiceIndex) {
  while (bar.voices.length <= voiceIndex) {
    const v = new M.Voice();
    bar.addVoice(v);
    addPlaceholderRest(v);
  }
  return bar.voices[voiceIndex];
}

// ── Acceso seguro a la jerarquía ─────────────────────────────────
export function getTrack(score, t) {
  const track = score.tracks[t];
  if (!track) throw new Error(`No existe la pista ${t}`);
  return track;
}
export function getBar(score, t, b, staffIndex = 0) {
  const staff = getTrack(score, t).staves[staffIndex];
  const bar = staff && staff.bars[b];
  if (!bar) throw new Error(`No existe el compás ${b} en la pista ${t}`);
  return bar;
}
export function getBeat(score, t, b, v, i) {
  const voice = getBar(score, t, b).voices[v];
  if (!voice) throw new Error(`No existe la voz ${v} (pista ${t}, compás ${b})`);
  const beat = voice.beats[i];
  if (!beat) throw new Error(`No existe el beat ${i} (pista ${t}, compás ${b}, voz ${v})`);
  return beat;
}

// ── Serialización ────────────────────────────────────────────────
export function finish(score) {
  score.finish(settings);
  return score;
}
export function toJsonObject(score) {
  return JSON.parse(M.JsonConverter.scoreToJson(score));
}
export function fromJsonObject(obj) {
  return M.JsonConverter.jsonToScore(JSON.stringify(obj), settings);
}

// Partitura mínima válida: 1 pista pitched, 1 compás 4/4, tempo dado.
export function newScore({ title = "", artist = "", tempo = 120, trackName = "Pista 1", program = 0, tuning = null } = {}) {
  const score = new M.Score();
  score.title = title;
  score.artist = artist;
  score.addMasterBar(makeMasterBar(4, 4));
  setTempo(score, tempo);
  score.addTrack(makeTrack(score, { name: trackName, program, tuning }));
  return finish(score);
}
