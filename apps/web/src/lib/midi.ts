// Construye un MIDI a partir del Score con AlphaTab, sobre una COPIA (round-trip
// JSON) para no alterar la partitura abierta. Permite filtrar pistas y aplicar la
// mezcla (volumen 0-16, balance 0-16). Lo usan tanto la exportación MIDI como la
// de MP3 (que sube este MIDI al backend para renderizarlo con FluidSynth).
import * as alphaTab from "@coderline/alphatab";

export interface MidiBuildOpts {
  includes: Set<number>; // índices de pista a incluir
  mix?: Record<number, { volume: number; balance: number }>;
  format?: alphaTab.midi.MidiFileFormat;
}

export function buildScoreMidi(
  score: alphaTab.model.Score,
  settings: alphaTab.Settings | null,
  opts: MidiBuildOpts,
): Uint8Array {
  const json = alphaTab.model.JsonConverter.scoreToJson(score);
  const clone = alphaTab.model.JsonConverter.jsonToScore(json, settings ?? undefined);
  const kept = clone.tracks.filter((t) => opts.includes.has(t.index));
  for (const t of kept) {
    const m = opts.mix?.[t.index];
    if (m) {
      t.playbackInfo.volume = m.volume;
      t.playbackInfo.balance = m.balance;
    }
    t.playbackInfo.isMute = false;
    t.playbackInfo.isSolo = false;
  }
  kept.forEach((t, i) => (t.index = i));
  clone.tracks = kept;

  const midi = new alphaTab.midi.MidiFile();
  midi.format = opts.format ?? alphaTab.midi.MidiFileFormat.MultiTrack;
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
  new alphaTab.midi.MidiFileGenerator(clone, settings, handler).generate();
  return midi.toBinary();
}
