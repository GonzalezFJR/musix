#!/usr/bin/env node
// CLI del sidecar score-engine. Protocolo: `node src/index.mjs <command>`, lee un
// objeto JSON por stdin y escribe un objeto JSON por stdout. Pensado para invocarse
// como subprocess desde el backend Python (un proceso por operación, sin estado).
//
// Comandos:
//   new       stdin {meta?}                 → {ok, score, ir}
//   validate  stdin {score}                 → {ok, errors?, score, ir}
//   to-ir     stdin {score}                 → {ok, ir}
//   apply     stdin {score?, ops:[...]}     → {ok, score, ir, results} | {ok:false, error}
//
// `score` es el JSON de AlphaTab (objeto). Si `apply` no recibe score, parte de una
// partitura nueva mínima. Salida siempre con exit code 0; el campo `ok` indica éxito.
import { finish, toJsonObject, fromJsonObject, newScore, settings } from "./build.mjs";
import { scoreToIr } from "./ir.mjs";
import { applyOps, OP_NAMES } from "./ops.mjs";

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function loadScore(input) {
  // jsonToScore + finish: si AlphaTab lo acepta, es válido.
  const score = fromJsonObject(input.score);
  finish(score);
  return score;
}

async function main() {
  const cmd = process.argv[2];
  const input = await readStdin();

  switch (cmd) {
    case "ops":
      return out({ ok: true, ops: OP_NAMES });

    case "new": {
      const score = newScore(input.meta || {});
      return out({ ok: true, score: toJsonObject(score), ir: scoreToIr(score) });
    }

    case "validate": {
      const score = loadScore(input);
      return out({ ok: true, score: toJsonObject(score), ir: scoreToIr(score) });
    }

    case "to-ir": {
      const score = loadScore(input);
      return out({ ok: true, ir: scoreToIr(score) });
    }

    case "apply": {
      const score = input.score ? fromJsonObject(input.score) : newScore(input.meta || {});
      const results = applyOps(score, input.ops || []);
      finish(score); // valida el resultado
      return out({ ok: true, results, score: toJsonObject(score), ir: scoreToIr(score) });
    }

    default:
      return out({ ok: false, error: `Comando desconocido: ${cmd}` });
  }
}

main().catch((err) => {
  out({ ok: false, error: String(err && err.message ? err.message : err) });
  process.exitCode = 0; // el error viaja en el cuerpo, no en el exit code
});
