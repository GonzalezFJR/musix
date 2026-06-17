// Exportación de MIDI avanzada: elegir qué pistas incluir, ajustar la mezcla
// (volumen y panorama por pista) y el formato del fichero (SMF tipo 0 ó 1).
// Genera el MIDI con el MidiFileGenerator de AlphaTab sobre una COPIA del score
// (round-trip JSON) para no alterar la partitura abierta.
import * as alphaTab from "@coderline/alphatab";
import { useEffect, useState } from "react";

import { buildScoreMidi } from "../../lib/midi";
import Icon from "../ui/Icon";
import Modal from "../ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  score: alphaTab.model.Score | null;
  settings: alphaTab.Settings | null;
  title: string;
}

type Mix = { include: boolean; volume: number; balance: number };

const BAL_LABEL = (b: number) => (b === 8 ? "C" : b < 8 ? `I${8 - b}` : `D${b - 8}`);

export default function MidiExportModal({ open, onClose, score, settings, title }: Props) {
  const [mix, setMix] = useState<Record<number, Mix>>({});
  const [format, setFormat] = useState<alphaTab.midi.MidiFileFormat>(
    alphaTab.midi.MidiFileFormat.MultiTrack,
  );

  // Al abrir, inicializa la mezcla desde el playbackInfo de cada pista.
  useEffect(() => {
    if (!open || !score) return;
    const next: Record<number, Mix> = {};
    for (const t of score.tracks) {
      next[t.index] = {
        include: true,
        volume: t.playbackInfo?.volume ?? 16,
        balance: t.playbackInfo?.balance ?? 8,
      };
    }
    setMix(next);
  }, [open, score]);

  if (!score) return null;
  const tracks = score.tracks;
  const includedCount = tracks.filter((t) => mix[t.index]?.include).length;

  const patch = (index: number, p: Partial<Mix>) =>
    setMix((m) => ({ ...m, [index]: { ...m[index], ...p } }));
  const setAll = (include: boolean) =>
    setMix((m) => {
      const next = { ...m };
      for (const t of tracks) next[t.index] = { ...next[t.index], include };
      return next;
    });

  function exportMidi() {
    if (!score || includedCount === 0) return;
    const includes = new Set(tracks.filter((t) => mix[t.index]?.include).map((t) => t.index));
    const bytes = buildScoreMidi(score, settings, { includes, mix, format });

    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "audio/midi" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.mid`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Exportar MIDI" width={520}>
      {/* Formato */}
      <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Formato</div>
      <div className="mb-4 flex gap-1">
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-xs ${
            format === alphaTab.midi.MidiFileFormat.MultiTrack
              ? "bg-accent text-ink-900"
              : "bg-ink-700 text-slate-300 hover:bg-ink-600"
          }`}
          onClick={() => setFormat(alphaTab.midi.MidiFileFormat.MultiTrack)}
        >
          Multipista (SMF 1)
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-xs ${
            format === alphaTab.midi.MidiFileFormat.SingleTrackMultiChannel
              ? "bg-accent text-ink-900"
              : "bg-ink-700 text-slate-300 hover:bg-ink-600"
          }`}
          onClick={() => setFormat(alphaTab.midi.MidiFileFormat.SingleTrackMultiChannel)}
        >
          Una pista (SMF 0)
        </button>
      </div>

      {/* Pistas + mezcla */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Pistas y mezcla</span>
        <div className="flex gap-2 text-[11px]">
          <button className="text-slate-400 hover:text-accent" onClick={() => setAll(true)}>
            Todas
          </button>
          <button className="text-slate-400 hover:text-accent" onClick={() => setAll(false)}>
            Ninguna
          </button>
        </div>
      </div>
      <div className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
        {tracks.map((t) => {
          const m = mix[t.index] ?? { include: true, volume: 16, balance: 8 };
          return (
            <div
              key={t.index}
              className={`rounded-md border px-2.5 py-2 ${
                m.include ? "border-ink-600 bg-ink-900/60" : "border-transparent bg-ink-900/30 opacity-60"
              }`}
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={m.include}
                  onChange={(e) => patch(t.index, { include: e.target.checked })}
                  className="accent-accent"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                  {t.name || `Pista ${t.index + 1}`}
                </span>
              </label>
              {m.include && (
                <div className="mt-1.5 flex items-center gap-3 pl-6">
                  <div className="flex flex-1 items-center gap-1.5">
                    <Icon name="volume" size={13} className="text-slate-500" />
                    <input
                      type="range"
                      min={0}
                      max={16}
                      value={m.volume}
                      onChange={(e) => patch(t.index, { volume: Number(e.target.value) })}
                      className="h-1 flex-1 accent-accent"
                    />
                    <span className="w-6 text-right text-[10px] tabular-nums text-slate-500">{m.volume}</span>
                  </div>
                  <div className="flex flex-1 items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">Pan</span>
                    <input
                      type="range"
                      min={0}
                      max={16}
                      value={m.balance}
                      onChange={(e) => patch(t.index, { balance: Number(e.target.value) })}
                      className="h-1 flex-1 accent-accent"
                    />
                    <span className="w-6 text-right text-[10px] tabular-nums text-slate-500">{BAL_LABEL(m.balance)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">{includedCount} de {tracks.length} pistas</span>
        <button
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
          onClick={exportMidi}
          disabled={includedCount === 0}
        >
          <Icon name="export" size={15} /> Exportar .mid
        </button>
      </div>
    </Modal>
  );
}
