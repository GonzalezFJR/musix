// Operaciones de mutación sobre el modelo AlphaTab (fuente de verdad). Cada op es
// un objeto { op: "<nombre>", ...args }. applyOps las aplica en orden y devuelve un
// array de resultados (p. ej. el índice del elemento creado). El caller hace finish().
import {
  M, parseDuration, midiToOctaveTone, pitchToMidi, setTempo,
  makeMasterBar, makeTrack, makeEmptyBar, ensureVoice, isPlaceholderVoice,
  getTrack, getBar, getBeat,
} from "./build.mjs";

// ── Meta ─────────────────────────────────────────────────────────
function setMeta(score, a) {
  for (const k of ["title", "subtitle", "artist", "album", "music", "words"]) {
    if (a[k] != null) score[k === "subtitle" ? "subTitle" : k] = String(a[k]);
  }
  if (a.tempo != null) setTempo(score, Number(a.tempo));
  return {};
}

// ── Pistas ───────────────────────────────────────────────────────
function addTrack(score, a) {
  const track = makeTrack(score, {
    name: a.name ?? `Pista ${score.tracks.length + 1}`,
    program: a.midiProgram ?? 0,
    tuning: a.tuning ?? null,
    percussion: !!a.percussion,
  });
  score.addTrack(track);
  return { track: score.tracks.length - 1 };
}

function updateTrack(score, a) {
  const track = getTrack(score, a.track);
  if (a.name != null) track.name = String(a.name);
  if (a.midiProgram != null) track.playbackInfo.program = Number(a.midiProgram) & 0x7f;
  if (a.volume != null) track.playbackInfo.volume = Math.max(0, Math.min(16, Number(a.volume)));
  if (a.balance != null) track.playbackInfo.balance = Math.max(0, Math.min(16, Number(a.balance)));
  if (a.mute != null) track.playbackInfo.isMute = !!a.mute;
  if (a.solo != null) track.playbackInfo.isSolo = !!a.solo;
  if (Array.isArray(a.tuning)) track.staves[0].stringTuning.tunings = a.tuning.slice();
  return {};
}

function removeTrack(score, a) {
  getTrack(score, a.track);
  score.tracks.splice(a.track, 1);
  return {};
}

// ── Compases (master bars + bar por pista) ───────────────────────
function appendBar(score, a) {
  const last = score.masterBars[score.masterBars.length - 1];
  const num = a.numerator ?? (last ? last.timeSignatureNumerator : 4);
  const den = a.denominator ?? (last ? last.timeSignatureDenominator : 4);
  score.addMasterBar(makeMasterBar(num, den));
  const idx = score.masterBars.length - 1;
  for (const track of score.tracks) track.staves[0].addBar(makeEmptyBar(score, idx));
  return { bar: idx };
}

function insertBar(score, a) {
  const at = Math.max(0, Math.min(a.at ?? score.masterBars.length, score.masterBars.length));
  const ref = score.masterBars[at] || score.masterBars[score.masterBars.length - 1];
  const num = a.numerator ?? (ref ? ref.timeSignatureNumerator : 4);
  const den = a.denominator ?? (ref ? ref.timeSignatureDenominator : 4);
  score.masterBars.splice(at, 0, makeMasterBar(num, den));
  for (const track of score.tracks) track.staves[0].bars.splice(at, 0, makeEmptyBar(score, at));
  return { bar: at };
}

function removeBar(score, a) {
  if (a.index < 0 || a.index >= score.masterBars.length) throw new Error(`No existe el compás ${a.index}`);
  score.masterBars.splice(a.index, 1);
  for (const track of score.tracks) track.staves[0].bars.splice(a.index, 1);
  return {};
}

function setBarTime(score, a) {
  const mb = score.masterBars[a.index];
  if (!mb) throw new Error(`No existe el compás ${a.index}`);
  mb.timeSignatureNumerator = Number(a.numerator);
  mb.timeSignatureDenominator = Number(a.denominator);
  return {};
}

function setBarSection(score, a) {
  const mb = score.masterBars[a.index];
  if (!mb) throw new Error(`No existe el compás ${a.index}`);
  if (a.text) {
    const section = new M.Section();
    section.text = String(a.text);
    section.marker = a.marker ? String(a.marker) : "";
    mb.section = section;
  } else {
    mb.section = null;
  }
  return {};
}

// ── Beats ────────────────────────────────────────────────────────
function applyBeatProps(beat, a) {
  if (a.duration != null) beat.duration = parseDuration(a.duration);
  if (a.dots != null) beat.dots = Number(a.dots);
  if (a.text != null) beat.text = String(a.text) || null;
  if (Array.isArray(a.lyrics)) beat.lyrics = a.lyrics.map(String);
  if (a.chord != null) {
    if (a.chord) {
      const chord = new M.Chord();
      chord.name = String(a.chord);
      const id = chord.name;
      beat.chordId = id;
      beat.voice.bar.staff.addChord(id, chord);
    } else {
      beat.chordId = null;
    }
  }
  if (a.dynamics != null) beat.dynamics = Number(a.dynamics);
  if (Array.isArray(a.tuplet) && a.tuplet.length === 2) {
    beat.tupletNumerator = Number(a.tuplet[0]);
    beat.tupletDenominator = Number(a.tuplet[1]);
  }
}

// Si la voz solo tiene el silencio placeholder de un compás vacío, lo descartamos
// al escribir el primer beat real (así "componer en un compás vacío" es intuitivo).
function clearPlaceholder(voice) {
  if (isPlaceholderVoice(voice)) voice.beats = [];
}

function addBeat(score, a) {
  const bar = getBar(score, a.track, a.bar);
  const voice = ensureVoice(bar, a.voice ?? 0);
  clearPlaceholder(voice);
  const beat = new M.Beat();
  beat.duration = a.duration != null ? parseDuration(a.duration) : M.Duration.Quarter;
  voice.addBeat(beat);
  applyBeatProps(beat, a);
  if (!a.rest && Array.isArray(a.notes)) {
    for (const n of a.notes) addNoteTo(beat, n, score, a.track);
  }
  return { beat: voice.beats.length - 1 };
}

function updateBeat(score, a) {
  applyBeatProps(getBeat(score, a.track, a.bar, a.voice ?? 0, a.beat), a);
  return {};
}

function removeBeat(score, a) {
  const voice = getBar(score, a.track, a.bar).voices[a.voice ?? 0];
  if (!voice || !voice.beats[a.beat]) throw new Error(`No existe el beat ${a.beat}`);
  voice.beats.splice(a.beat, 1);
  return {};
}

function clearBar(score, a) {
  const bar = getBar(score, a.track, a.bar);
  const voices = a.voice != null ? [bar.voices[a.voice]] : bar.voices;
  for (const v of voices) if (v) v.beats = [];
  return {};
}

// ── Notas ────────────────────────────────────────────────────────
function addNoteTo(beat, n, score, trackIndex) {
  const note = new M.Note();
  const staff = score.tracks[trackIndex].staves[0];
  const isTab = staff.stringTuning && Array.isArray(staff.stringTuning.tunings) && staff.stringTuning.tunings.length > 0;
  if (n.string != null && n.fret != null) {
    note.string = Number(n.string);
    note.fret = Number(n.fret);
  } else if (n.pitch != null) {
    const { octave, tone } = midiToOctaveTone(pitchToMidi(n.pitch));
    note.octave = octave;
    note.tone = tone;
  } else {
    throw new Error("Nota sin pitch ni string/fret");
  }
  if (n.tie) note.isTieDestination = true;
  if (n.dynamics != null) note.dynamics = Number(n.dynamics);
  beat.addNote(note);
  return beat.notes.length - 1;
}

function addNote(score, a) {
  const beat = getBeat(score, a.track, a.bar, a.voice ?? 0, a.beat);
  const idx = addNoteTo(beat, a, score, a.track);
  return { note: idx };
}

function updateNote(score, a) {
  const beat = getBeat(score, a.track, a.bar, a.voice ?? 0, a.beat);
  const note = beat.notes[a.note];
  if (!note) throw new Error(`No existe la nota ${a.note}`);
  if (a.string != null) note.string = Number(a.string);
  if (a.fret != null) note.fret = Number(a.fret);
  if (a.pitch != null) {
    const { octave, tone } = midiToOctaveTone(pitchToMidi(a.pitch));
    note.octave = octave;
    note.tone = tone;
  }
  if (a.tie != null) note.isTieDestination = !!a.tie;
  if (a.dynamics != null) note.dynamics = Number(a.dynamics);
  return {};
}

function removeNote(score, a) {
  const beat = getBeat(score, a.track, a.bar, a.voice ?? 0, a.beat);
  if (!beat.notes[a.note]) throw new Error(`No existe la nota ${a.note}`);
  beat.notes.splice(a.note, 1);
  return {};
}

const OPS = {
  setMeta, addTrack, updateTrack, removeTrack,
  appendBar, insertBar, removeBar, setBarTime, setBarSection,
  addBeat, updateBeat, removeBeat, clearBar,
  addNote, updateNote, removeNote,
};

export function applyOps(score, ops) {
  const results = [];
  ops.forEach((op, i) => {
    const fn = OPS[op.op];
    if (!fn) throw new Error(`Operación desconocida: ${op.op} (índice ${i})`);
    results.push(fn(score, op) || {});
  });
  return results;
}

export const OP_NAMES = Object.keys(OPS);
