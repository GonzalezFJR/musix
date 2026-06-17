// Exportación a MP3: por cada pista incluida genera un MIDI en el cliente
// (AlphaTab) con su mezcla, y lo sube junto al mapa de instrumentos. El backend
// renderiza cada pista con su motor (FluidSynth para SF2, sfizz para SFZ), mezcla
// y devuelve el MP3. Muestra los créditos (atribución) de las librerías usadas.
import * as alphaTab from "@coderline/alphatab";
import { useEffect, useState } from "react";

import { getToken, type SfzInstrument } from "../../lib/api";
import { buildScoreMidi } from "../../lib/midi";
import type { TrackInstrument } from "../ScoreViewer";
import Icon from "../ui/Icon";
import Modal from "../ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  score: alphaTab.model.Score | null;
  settings: alphaTab.Settings | null;
  title: string;
  trackInstruments: Record<number, TrackInstrument>;
  sfzCatalog: SfzInstrument[];
}

type Mix = { include: boolean; volume: number; balance: number };
const BAL_LABEL = (b: number) => (b === 8 ? "C" : b < 8 ? `I${8 - b}` : `D${b - 8}`);
const BITRATES = ["128k", "192k", "256k", "320k"];

export default function Mp3ExportModal({
  open,
  onClose,
  score,
  settings,
  title,
  trackInstruments,
  sfzCatalog,
}: Props) {
  const [mix, setMix] = useState<Record<number, Mix>>({});
  const [bitrate, setBitrate] = useState("192k");
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
  }, [open, score]);

  if (!score) return null;
  const tracks = score.tracks;
  const includedCount = tracks.filter((t) => mix[t.index]?.include).length;
  const sfzName = (id: string) => sfzCatalog.find((s) => s.id === id)?.name ?? id;
  const instLabel = (idx: number) => {
    const inst = trackInstruments[idx];
    return inst?.engine === "sfz" ? `◆ ${sfzName(inst.id)}` : "General MIDI";
  };

  const patch = (index: number, p: Partial<Mix>) =>
    setMix((m) => ({ ...m, [index]: { ...m[index], ...p } }));
  const setAll = (include: boolean) =>
    setMix((m) => {
      const next = { ...m };
      for (const t of tracks) next[t.index] = { ...next[t.index], include };
      return next;
    });

  async function exportMp3() {
    if (!score || includedCount === 0) return;
    setRendering(true);
    setError(null);
    try {
      const form = new FormData();
      const specs: object[] = [];
      for (const t of tracks) {
        if (!mix[t.index]?.include) continue;
        const bytes = buildScoreMidi(score, settings, { includes: new Set([t.index]), mix });
        form.append("midi", new Blob([bytes as unknown as BlobPart], { type: "audio/midi" }), `t${t.index}.mid`);
        const inst = trackInstruments[t.index];
        specs.push(inst?.engine === "sfz" ? { engine: "sfz", id: inst.id } : { engine: "sf2" });
      }
      form.append("instruments", JSON.stringify(specs));
      form.append("bitrate", bitrate);
      form.append("filename", title);

      const headers = new Headers();
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const res = await fetch("/api/render/mp3", { method: "POST", headers, body: form });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          detail = (await res.json()).detail ?? detail;
        } catch {
          /* sin cuerpo JSON */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo renderizar el MP3.");
    } finally {
      setRendering(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Exportar MP3" width={540}>
      <p className="mb-3 text-xs leading-snug text-slate-400">
        Cada pista se renderiza con su instrumento asignado (lo eliges en el panel de Pistas). La
        previsualización en vivo puede sonar distinta al MP3.
      </p>

      <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Calidad</div>
      <div className="mb-4 flex gap-1">
        {BITRATES.map((b) => (
          <button
            key={b}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs ${
              bitrate === b ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"
            }`}
            onClick={() => setBitrate(b)}
          >
            {b.replace("k", " kbps")}
          </button>
        ))}
      </div>

      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Pistas y mezcla</span>
        <div className="flex gap-2 text-[11px]">
          <button className="text-slate-400 hover:text-accent" onClick={() => setAll(true)}>Todas</button>
          <button className="text-slate-400 hover:text-accent" onClick={() => setAll(false)}>Ninguna</button>
        </div>
      </div>
      <div className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
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
                <span className="shrink-0 text-[10px] text-slate-500">{instLabel(t.index)}</span>
              </label>
              {m.include && (
                <div className="mt-1.5 flex items-center gap-3 pl-6">
                  <div className="flex flex-1 items-center gap-1.5">
                    <Icon name="volume" size={13} className="text-slate-500" />
                    <input
                      type="range" min={0} max={16} value={m.volume}
                      onChange={(e) => patch(t.index, { volume: Number(e.target.value) })}
                      className="h-1 flex-1 accent-accent"
                    />
                    <span className="w-6 text-right text-[10px] tabular-nums text-slate-500">{m.volume}</span>
                  </div>
                  <div className="flex flex-1 items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">Pan</span>
                    <input
                      type="range" min={0} max={16} value={m.balance}
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

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">{includedCount} de {tracks.length} pistas</span>
        <button
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
          onClick={exportMp3}
          disabled={includedCount === 0 || rendering}
        >
          <Icon name="export" size={15} /> {rendering ? "Renderizando…" : "Exportar .mp3"}
        </button>
      </div>
    </Modal>
  );
}
