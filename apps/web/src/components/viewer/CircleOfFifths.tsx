// Círculo de quintas interactivo. Anillo exterior = tonalidades MAYORES en orden de
// quintas (Do arriba, sentido horario); anillo interior = sus relativas MENORES.
// Clic en un sector elige tónica + modo; una fila de modos permite además griegos.
// Resalta la escala ACTUAL de la zona (anillo punteado) y la SELECCIONADA (relleno).
import {
  CIRCLE_MAJOR,
  keySignatureFor,
  MODES,
  relativeMinorTonic,
  scaleDisplay,
  type ModeKey,
} from "../../lib/scales";
import { type ChordNotation } from "../../lib/chords";

interface Sel {
  tonic: number;
  mode: ModeKey;
}
interface Props {
  notation: ChordNotation;
  selected: Sel;
  current?: Sel | null;
  onSelect: (sel: Sel) => void;
}

const CX = 150;
const CY = 150;
const R_OUT = 142;
const R_MID = 96;
const R_IN = 54;

function pt(r: number, aDeg: number): [number, number] {
  const a = (aDeg - 90) * (Math.PI / 180); // 0° = arriba
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function sector(rIn: number, rOut: number, a0: number, a1: number): string {
  const [x0o, y0o] = pt(rOut, a0);
  const [x1o, y1o] = pt(rOut, a1);
  const [x1i, y1i] = pt(rIn, a1);
  const [x0i, y0i] = pt(rIn, a0);
  return `M${x0o} ${y0o} A${rOut} ${rOut} 0 0 1 ${x1o} ${y1o} L${x1i} ${y1i} A${rIn} ${rIn} 0 0 0 ${x0i} ${y0i} Z`;
}

function keySigLabel(v: number): string {
  if (v === 0) return "♮";
  return v > 0 ? `${v}♯` : `${-v}♭`;
}

export default function CircleOfFifths({ notation, selected, current, onSelect }: Props) {
  const segs = CIRCLE_MAJOR.map((majorTonic, i) => {
    const center = i * 30;
    const a0 = center - 15;
    const a1 = center + 15;
    const minorTonic = relativeMinorTonic(majorTonic);
    const majorSel = selected.mode === "ionian" && selected.tonic === majorTonic;
    const minorSel = selected.mode === "aeolian" && selected.tonic === minorTonic;
    // Para modos griegos, resaltamos el sector exterior de la tónica seleccionada.
    const otherSel =
      selected.mode !== "ionian" && selected.mode !== "aeolian" && selected.tonic === majorTonic;
    const majorCur = current?.mode === "ionian" && current?.tonic === majorTonic;
    const minorCur = current?.mode === "aeolian" && current?.tonic === minorTonic;
    return { i, majorTonic, minorTonic, center, a0, a1, majorSel: majorSel || otherSel, minorSel, majorCur, minorCur };
  });

  const fill = (on: boolean) => (on ? "#2dd4bf" : "#1a1e27");
  const txt = (on: boolean) => (on ? "#0b0d12" : "#cbd5e1");

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={300} height={300} viewBox="0 0 300 300" className="select-none">
        {segs.map((s) => {
          const [lx, ly] = pt((R_OUT + R_MID) / 2, s.center);
          const [mx, my] = pt((R_MID + R_IN) / 2, s.center);
          return (
            <g key={s.i}>
              <path
                d={sector(R_MID, R_OUT, s.a0, s.a1)}
                fill={fill(s.majorSel)}
                stroke={s.majorCur ? "#fbbf24" : "#39404f"}
                strokeWidth={s.majorCur ? 2.5 : 1}
                strokeDasharray={s.majorCur ? "4 3" : undefined}
                className="cursor-pointer transition-colors hover:brightness-125"
                onClick={() => onSelect({ tonic: s.majorTonic, mode: "ionian" })}
              />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill={txt(s.majorSel)} className="pointer-events-none">
                {scaleDisplay(s.majorTonic, "ionian", notation)}
              </text>
              <path
                d={sector(R_IN, R_MID, s.a0, s.a1)}
                fill={fill(s.minorSel)}
                stroke={s.minorCur ? "#fbbf24" : "#39404f"}
                strokeWidth={s.minorCur ? 2.5 : 1}
                strokeDasharray={s.minorCur ? "4 3" : undefined}
                className="cursor-pointer transition-colors hover:brightness-125"
                onClick={() => onSelect({ tonic: s.minorTonic, mode: "aeolian" })}
              />
              <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={txt(s.minorSel)} className="pointer-events-none">
                {scaleDisplay(s.minorTonic, "aeolian", notation)}
              </text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={R_IN} fill="#0b0d12" stroke="#39404f" />
        <text x={CX} y={CY - 8} textAnchor="middle" fontSize={13} fontWeight={700} fill="#2dd4bf">
          {scaleDisplay(selected.tonic, selected.mode, notation, { full: true })}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize={11} fill="#94a3b8">
          armadura {keySigLabel(keySignatureFor(selected.tonic, selected.mode))}
        </text>
      </svg>

      {/* Selector de modo: el círculo elige la tónica, esto el modo. */}
      <div className="flex flex-wrap justify-center gap-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => onSelect({ tonic: selected.tonic, mode: m.key })}
            className={`rounded px-2 py-1 text-xs ${
              selected.mode === m.key ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
