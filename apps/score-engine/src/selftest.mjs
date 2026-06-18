// Autotest del sidecar: compone, valida, round-trip y comprueba errores.
// Ejecutar: npm run selftest  (o: node src/selftest.mjs)
import assert from "node:assert";
import { newScore, toJsonObject, fromJsonObject, finish } from "./build.mjs";
import { scoreToIr } from "./ir.mjs";
import { applyOps } from "./ops.mjs";

let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// 1) new → partitura mínima válida
{
  const s = newScore({ title: "T", artist: "A", tempo: 100 });
  const ir = scoreToIr(s);
  assert.equal(ir.meta.title, "T");
  assert.equal(ir.meta.tempo, 100);
  assert.equal(ir.tracks.length, 1);
  assert.equal(ir.tracks[0].bars.length, 1);
  ok("new genera partitura mínima válida");
}

// 2) composición: melodía pitched, acorde, silencio, segundo compás 3/4, pista tab
{
  const s = newScore({ title: "Demo" });
  applyOps(s, [
    { op: "setMeta", tempo: 90, artist: "Claude" },
    { op: "addBeat", track: 0, bar: 0, duration: "quarter", notes: [{ pitch: "C4" }] },
    { op: "addBeat", track: 0, bar: 0, duration: "quarter", notes: [{ pitch: 64 }] },
    { op: "addBeat", track: 0, bar: 0, duration: "quarter", rest: true },
    { op: "appendBar", numerator: 3, denominator: 4 },
    { op: "addBeat", track: 0, bar: 1, duration: "half", notes: [{ pitch: 60 }, { pitch: 64 }, { pitch: 67 }] },
    { op: "addTrack", name: "Gtr", midiProgram: 25, tuning: [64, 59, 55, 50, 45, 40] },
    { op: "addBeat", track: 1, bar: 0, duration: "eighth", notes: [{ string: 1, fret: 3 }] },
  ]);
  finish(s);
  const ir = scoreToIr(s);
  const c0 = ir.tracks[0].bars[0].voices[0];
  assert.equal(c0.length, 3);
  assert.equal(c0[0].notes[0].pitch, 60, "C4 == MIDI 60");
  assert.equal(c0[0].notes[0].name, "C4");
  assert.equal(c0[1].notes[0].pitch, 64);
  assert.equal(c0[2].rest, true);
  assert.deepEqual(ir.tracks[0].bars[1].time, [3, 4]);
  assert.equal(ir.tracks[0].bars[1].voices[0][0].notes.length, 3, "acorde de 3 notas");
  assert.equal(ir.tracks.length, 2);
  assert.equal(ir.tracks[1].tuning.length, 6);
  ok("compone melodía + acorde + silencio + compás 3/4 + pista tab");
}

// 3) round-trip estable: score → json → score → json
{
  const s = newScore({ title: "RT" });
  applyOps(s, [{ op: "addBeat", track: 0, bar: 0, duration: "quarter", notes: [{ pitch: "A4" }] }]);
  finish(s);
  const j1 = JSON.stringify(toJsonObject(s));
  const s2 = fromJsonObject(JSON.parse(j1));
  finish(s2);
  const j2 = JSON.stringify(toJsonObject(s2));
  assert.equal(j1, j2, "round-trip idéntico");
  ok("round-trip score↔json estable");
}

// 4) errores claros
{
  assert.throws(() => applyOps(newScore({}), [{ op: "addBeat", track: 9, bar: 0 }]), /pista 9/);
  assert.throws(() => applyOps(newScore({}), [{ op: "noexiste" }]), /desconocida/);
  assert.throws(() => applyOps(newScore({}), [{ op: "addBeat", track: 0, bar: 0, duration: "tresillo" }]), /Duración/);
  ok("operaciones inválidas lanzan errores legibles");
}

// 5) edición: update/remove
{
  const s = newScore({});
  applyOps(s, [
    { op: "addBeat", track: 0, bar: 0, duration: "quarter", notes: [{ pitch: 60 }] },
    { op: "addBeat", track: 0, bar: 0, duration: "quarter", notes: [{ pitch: 62 }] },
    { op: "updateNote", track: 0, bar: 0, beat: 0, note: 0, pitch: 72 },
    { op: "removeBeat", track: 0, bar: 0, beat: 1 },
  ]);
  finish(s);
  const v = scoreToIr(s).tracks[0].bars[0].voices[0];
  assert.equal(v.length, 1);
  assert.equal(v[0].notes[0].pitch, 72);
  ok("updateNote / removeBeat funcionan");
}

console.log(`\nOK — ${n} grupos de aserciones pasados`);
