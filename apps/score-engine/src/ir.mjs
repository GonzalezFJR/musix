// Conversión Score (AlphaTab) → IR Musix: una vista plana, estable y documentada
// pensada para que un LLM lea el estado de la partitura. Es de SOLO LECTURA; las
// mutaciones se hacen con operaciones sobre el modelo real (ops.mjs).
import { durationName } from "./build.mjs";

function midiToName(midi) {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  if (typeof midi !== "number" || Number.isNaN(midi)) return null;
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function noteToIr(note) {
  const out = { pitch: note.realValue, name: midiToName(note.realValue) };
  if (note.isStringed) {
    out.string = note.string;
    out.fret = note.fret;
  }
  if (note.isTieDestination) out.tie = true;
  return out;
}

function beatToIr(beat, index) {
  const out = {
    index,
    duration: durationName(beat.duration),
    dots: beat.dots || 0,
    rest: beat.isRest,
    notes: beat.isRest ? [] : beat.notes.map(noteToIr),
  };
  if (beat.isEmpty) out.empty = true; // placeholder de compás vacío (no nota real)
  if (beat.text) out.text = beat.text;
  if (beat.lyrics && beat.lyrics.length) out.lyrics = beat.lyrics.slice();
  if (beat.chord && beat.chord.name) out.chord = beat.chord.name;
  if (beat.tupletNumerator > 1) out.tuplet = [beat.tupletNumerator, beat.tupletDenominator];
  return out;
}

function barToIr(bar, index) {
  const mb = bar.masterBar;
  return {
    index,
    time: [mb.timeSignatureNumerator, mb.timeSignatureDenominator],
    voices: bar.voices.map((v) => v.beats.map(beatToIr)),
    ...(mb.section && mb.section.text ? { section: mb.section.text } : {}),
  };
}

function trackToIr(track, index) {
  const staff = track.staves[0];
  const tuning = staff && staff.stringTuning ? staff.stringTuning.tunings : [];
  return {
    index,
    name: track.name,
    midiProgram: track.playbackInfo.program,
    isPercussion: track.playbackInfo.primaryChannel === 9,
    tuning: Array.isArray(tuning) ? tuning.slice() : [],
    bars: staff ? staff.bars.map(barToIr) : [],
  };
}

export function scoreToIr(score) {
  return {
    meta: {
      title: score.title || "",
      subtitle: score.subTitle || "",
      artist: score.artist || "",
      album: score.album || "",
      music: score.music || "",
      tempo: score.tempo,
    },
    tracks: score.tracks.map(trackToIr),
  };
}
