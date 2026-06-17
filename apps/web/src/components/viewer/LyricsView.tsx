// Vista "Letra": muestra la letra de la canción con los acordes encima, alineados
// por pulso (beat), a modo de cancionero para guitarra. NO dibuja pentagramas/tabs.
//
// - Organización por secciones (masterBar.section): cada sección es un bloque con
//   título (Estrofa, Estribillo…). El contenido se puede colapsar a solo el título.
//   Bloques colapsados CONSECUTIVOS con el mismo título se funden en "Título ×N".
// - Saltos de línea: automáticos cada N compases ("every") o definidos por el usuario
//   compás a compás ("custom"). Una sección siempre empieza en línea nueva.
// - En reproducción se resalta el verso (compás actual) y, dentro, el acorde/sílaba
//   del pulso presente.
import * as alphaTab from "@coderline/alphatab";
import { useMemo, useState, type ReactNode } from "react";

import { chordDisplay, type ChordNotation } from "../../lib/chords";
import Icon from "../ui/Icon";
import type { LyricsConfig } from "./viewConfig";

type Beat = alphaTab.model.Beat;

export interface BeatCell {
  beat: Beat;
  lyric: string;
  chord: string;
}
export interface BarCell {
  barIndex: number; // índice de compás (base 0)
  beats: BeatCell[];
}
export interface SectionBlock {
  title: string | null; // null = bloque inicial sin sección
  startBar: number; // compás donde empieza (clave estable de colapso)
  bars: BarCell[];
}

/** Agrupa los compases de una pista en bloques de sección con sus pulsos. */
export function buildBlocks(
  track: alphaTab.model.Track | null | undefined,
  notation: ChordNotation,
): SectionBlock[] {
  const staff = track?.staves?.[0];
  if (!staff) return [];
  const blocks: SectionBlock[] = [];
  let cur: SectionBlock | null = null;
  staff.bars.forEach((bar, i) => {
    const sectionText = bar.masterBar?.section?.text?.trim();
    if (sectionText || cur === null) {
      cur = { title: sectionText || null, startBar: i, bars: [] };
      blocks.push(cur);
    }
    const beats = (bar.voices?.[0]?.beats ?? []).filter((b) => !(b as any).isEmpty);
    cur.bars.push({
      barIndex: i,
      beats: beats.map((b) => ({
        beat: b,
        lyric: b.lyrics?.[0]?.trim() ?? "",
        chord: b.chordId ? chordDisplay(b.chordId, notation) : "",
      })),
    });
  });
  return blocks;
}

/** Reparte los compases de un bloque en líneas según la configuración de saltos. */
export function splitLines(block: SectionBlock, config: LyricsConfig): BarCell[][] {
  const breaks = new Set(config.customBreaks);
  const lines: BarCell[][] = [];
  let line: BarCell[] = [];
  block.bars.forEach((bc, idxInBlock) => {
    const breakHere =
      idxInBlock > 0 &&
      (config.breakMode === "custom"
        ? breaks.has(bc.barIndex)
        : idxInBlock % Math.max(1, config.barsPerLine) === 0);
    if (breakHere) {
      lines.push(line);
      line = [];
    }
    line.push(bc);
  });
  if (line.length) lines.push(line);
  return lines;
}

interface Props {
  track: alphaTab.model.Track | null | undefined;
  notation: ChordNotation;
  config: LyricsConfig;
  onConfigChange: (c: LyricsConfig) => void;
  playedBeat: Beat | null;
  version: number; // fuerza el recálculo tras una edición
  editMode: boolean;
  /** Clic en un pulso → seleccionar/situar (para editar la letra con T o reproducir). */
  onPickBeat?: (beat: Beat) => void;
}

export default function LyricsView({
  track,
  notation,
  config,
  onConfigChange,
  playedBeat,
  version,
  editMode,
  onPickBeat,
}: Props) {
  // Colapso por sección (clave = compás de inicio del bloque).
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const blocks = useMemo(
    () => buildBlocks(track, notation),
    // version cambia en cada edición de letra/acorde/sección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, notation, version],
  );

  // Pulso activo (reproducción): compás + rango de ticks del beat sonando.
  const activeBarIndex = playedBeat ? (playedBeat as any).voice?.bar?.index ?? -1 : -1;
  const activeStart = playedBeat ? playedBeat.absolutePlaybackStart : -1;
  const isActiveBeat = (b: Beat) =>
    activeStart >= 0 &&
    activeStart >= b.absolutePlaybackStart &&
    activeStart < b.absolutePlaybackStart + b.playbackDuration;

  const toggleCollapse = (startBar: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(startBar) ? next.delete(startBar) : next.add(startBar);
      return next;
    });

  const toggleBreak = (barIndex: number) => {
    const set = new Set(config.customBreaks);
    set.has(barIndex) ? set.delete(barIndex) : set.add(barIndex);
    onConfigChange({ ...config, customBreaks: [...set].sort((a, b) => a - b) });
  };

  if (!track) {
    return <div className="p-8 text-center text-sm text-slate-500">No hay pista para mostrar.</div>;
  }
  const hasAny = blocks.some((b) => b.title || b.bars.some((bc) => bc.beats.some((x) => x.lyric || x.chord)));

  // Recorre los bloques fusionando los colapsados consecutivos del mismo título.
  const rendered: ReactNode[] = [];
  for (let j = 0; j < blocks.length; j++) {
    const block = blocks[j];
    const nextStart = blocks[j + 1]?.startBar ?? Infinity;
    const activeInBlock = activeBarIndex >= block.startBar && activeBarIndex < nextStart;
    const blockCollapsed = block.title != null && collapsed.has(block.startBar);

    if (blockCollapsed) {
      let count = 1;
      let activeRun = activeInBlock;
      while (
        j + 1 < blocks.length &&
        blocks[j + 1].title === block.title &&
        collapsed.has(blocks[j + 1].startBar)
      ) {
        j++;
        count++;
        const ns = blocks[j + 1]?.startBar ?? Infinity;
        if (activeBarIndex >= blocks[j].startBar && activeBarIndex < ns) activeRun = true;
      }
      rendered.push(
        <button
          key={`c${block.startBar}`}
          onClick={() => toggleCollapse(block.startBar)}
          className={`group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
            activeRun ? "bg-accent/15 ring-1 ring-accent/50" : "hover:bg-black/5"
          }`}
          title="Expandir sección"
        >
          <Icon name="chevronRight" size={16} className="text-slate-500 group-hover:text-accent" />
          <span className="text-lg font-bold text-slate-800">{block.title}</span>
          {count > 1 && (
            <span className="rounded-full bg-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700">
              ×{count}
            </span>
          )}
        </button>,
      );
      continue;
    }

    const lines = splitLines(block, config);
    rendered.push(
      <div key={`b${block.startBar}`} className={activeInBlock ? "rounded-md" : ""}>
        {block.title && (
          <button
            onClick={() => toggleCollapse(block.startBar)}
            className="group mb-1 flex items-center gap-2"
            title="Colapsar sección"
          >
            <Icon name="chevronDown" size={16} className="text-slate-500 group-hover:text-accent" />
            <span className="text-lg font-bold text-slate-800">{block.title}</span>
          </button>
        )}
        <div className="space-y-2 pl-1">
          {lines.map((line, li) => (
            <div
              key={li}
              className="flex flex-wrap items-end gap-x-1 gap-y-2 font-mono text-[15px] leading-tight"
            >
              {line.map((bc, ci) => (
                <BarRow
                  key={bc.barIndex}
                  bar={bc}
                  showBreakHandle={editMode && config.breakMode === "custom" && (li > 0 || ci > 0)}
                  isBreak={config.customBreaks.includes(bc.barIndex)}
                  onToggleBreak={() => toggleBreak(bc.barIndex)}
                  active={bc.barIndex === activeBarIndex}
                  isActiveBeat={isActiveBeat}
                  onPickBeat={onPickBeat}
                  editMode={editMode}
                  first={ci === 0}
                />
              ))}
            </div>
          ))}
        </div>
      </div>,
    );
  }

  return (
    <div className="mx-auto max-w-[820px] px-6 py-8 text-slate-800">
      {!hasAny && (
        <p className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Esta canción aún no tiene letra ni acordes. En modo edición, selecciona un pulso y pulsa{" "}
          <b>T</b> para escribir la letra, o usa el botón <b>Acorde</b> para añadir acordes.
        </p>
      )}
      <div className="space-y-5">{rendered}</div>
    </div>
  );
}

// Un compás: pulsos con acorde arriba y sílaba abajo, alineados. Separador "|" al inicio.
function BarRow({
  bar,
  showBreakHandle,
  isBreak,
  onToggleBreak,
  active,
  isActiveBeat,
  onPickBeat,
  editMode,
  first,
}: {
  bar: BarCell;
  showBreakHandle: boolean;
  isBreak: boolean;
  onToggleBreak: () => void;
  active: boolean;
  isActiveBeat: (b: Beat) => boolean;
  onPickBeat?: (b: Beat) => void;
  editMode: boolean;
  first: boolean;
}) {
  return (
    <div className="flex items-stretch">
      {showBreakHandle && (
        <button
          onClick={onToggleBreak}
          title={isBreak ? "Quitar salto de línea aquí" : "Salto de línea antes de este compás"}
          className={`mr-0.5 flex w-4 items-center justify-center rounded text-[10px] ${
            isBreak ? "bg-accent text-ink-900" : "text-slate-400 hover:bg-black/10"
          }`}
        >
          ↵
        </button>
      )}
      {!first && <span className="mr-1 self-stretch text-slate-300">|</span>}
      <div
        className={`flex items-end gap-x-1 rounded px-1 ${
          active ? "bg-accent/20 ring-1 ring-accent/60" : ""
        }`}
      >
        {bar.beats.map((bc, i) => {
          const on = isActiveBeat(bc.beat);
          const empty = !bc.lyric && !bc.chord;
          return (
            <button
              key={i}
              onClick={() => onPickBeat?.(bc.beat)}
              className={`flex min-w-[0.6rem] flex-col items-start rounded px-0.5 text-left transition-colors hover:bg-black/5 ${
                on ? "bg-accent/40" : ""
              }`}
            >
              <span
                className={`h-[1.1em] whitespace-nowrap text-[13px] font-bold ${
                  on ? "text-ink-900" : "text-sky-700"
                }`}
              >
                {bc.chord || " "}
              </span>
              <span className={`whitespace-pre ${empty ? "text-slate-300" : ""}`}>
                {bc.lyric || (empty && editMode ? "·" : " ")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
