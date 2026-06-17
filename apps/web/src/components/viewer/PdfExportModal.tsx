// Exportación a PDF avanzada. Usa una instancia de AlphaTab INDEPENDIENTE (no toca
// la vista principal) para previsualizar con la configuración elegida: pistas,
// tamaño (zoom), compases por fila y orientación. Dos modos:
//   - Multipista: todas las pistas elegidas en sistemas alineados (un solo render).
//   - Por pista (concatenado): cada pista en su(s) página(s), una tras otra, en un
//     único documento de impresión (→ guardar como PDF).
import * as alphaTab from "@coderline/alphatab";
import { useEffect, useRef, useState } from "react";

import Icon from "../ui/Icon";
import Modal from "../ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  score: alphaTab.model.Score | null;
  tracks: { index: number; name: string }[];
  title: string;
}

type Mode = "multitrack" | "pertrack";
const SCALES = [0.6, 0.7, 0.8, 0.9, 1.0, 1.2];

// Aplica los ajustes de nombre de pista (negrita, al comienzo) a un api de AlphaTab.
function applyTrackNames(api: alphaTab.AlphaTabApi) {
  api.settings.notation.elements.set(alphaTab.NotationElement.ChordDiagrams, false);
  api.settings.notation.elements.set(alphaTab.NotationElement.TrackNames, true);
  const tn = api.settings.display.resources.elementFonts.get(alphaTab.NotationElement.TrackNames);
  if (tn) {
    tn.size = 15;
    tn.weight = alphaTab.model.FontWeight.Bold;
  }
}

export default function PdfExportModal({ open, onClose, score, tracks, title }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<Mode>("multitrack");
  const [scale, setScale] = useState(0.8);
  const [barsPerRow, setBarsPerRow] = useState(0); // 0 = automático
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [building, setBuilding] = useState(false);

  // Inicializa la selección al abrir (todas las pistas).
  useEffect(() => {
    if (open) setSelected(new Set(tracks.map((t) => t.index)));
  }, [open, tracks]);

  // Crea (y destruye) la instancia de previsualización con una copia del score.
  useEffect(() => {
    if (!open || !hostRef.current || !score) return;
    setReady(false);
    const json = alphaTab.model.JsonConverter.scoreToJson(score);
    const api = new alphaTab.AlphaTabApi(hostRef.current, {
      core: { fontDirectory: "/assets/alphatab/font/" },
      player: { enablePlayer: false },
      display: { scale: 0.8 },
    });
    apiRef.current = api;
    applyTrackNames(api);
    api.scoreLoaded.on((s) => {
      if (s.stylesheet) {
        const M = alphaTab.model;
        s.stylesheet.singleTrackTrackNamePolicy = M.TrackNamePolicy.FirstSystem;
        s.stylesheet.multiTrackTrackNamePolicy = M.TrackNamePolicy.FirstSystem;
        s.stylesheet.firstSystemTrackNameMode = M.TrackNameMode.FullName;
        s.stylesheet.firstSystemTrackNameOrientation = M.TrackNameOrientation.Horizontal;
      }
    });
    api.renderFinished.on(() => setReady(true));
    api.renderScore(alphaTab.model.JsonConverter.jsonToScore(json));
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, [open, score]);

  // Reaplica ajustes + pistas visibles cuando cambian (modo multipista).
  useEffect(() => {
    const api = apiRef.current;
    if (!api?.score || !ready) return;
    api.settings.display.scale = scale;
    api.settings.display.barsPerRow = barsPerRow > 0 ? barsPerRow : -1;
    api.updateSettings();
    const list = api.score.tracks.filter((t) => selected.has(t.index));
    api.renderTracks(list.length ? list : api.score.tracks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, barsPerRow, selected, ready]);

  if (!score) return null;
  const orderedSel = [...selected].sort((a, b) => a - b);

  const patchSel = (index: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      on ? next.add(index) : next.delete(index);
      return next;
    });

  // Espera a que un render concreto termine (one-shot) y devuelve el HTML del lienzo.
  function renderTracksCapture(api: alphaTab.AlphaTabApi, list: alphaTab.model.Track[]): Promise<string> {
    return new Promise((resolve) => {
      const handler = () => {
        api.renderFinished.off(handler);
        resolve(hostRef.current?.innerHTML ?? "");
      };
      api.renderFinished.on(handler);
      api.renderTracks(list);
    });
  }

  // Copia los <style>/<link> del documento (incluye las @font-face de AlphaTab) para
  // que la ventana de impresión renderice los glifos musicales correctamente.
  function headStyles(): string {
    const nodes = document.querySelectorAll('style, link[rel="stylesheet"]');
    return Array.from(nodes)
      .map((n) => n.outerHTML)
      .join("\n");
  }

  function openPrintWindow(sections: string[]) {
    const w = window.open("", "_blank");
    if (!w) {
      alert("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.");
      return;
    }
    const pageCss = `@page { size: ${orientation}; margin: 12mm; }`;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${headStyles()}` +
        `<style>${pageCss} body{margin:0;background:#fff} .musix-pg{page-break-after:always} ` +
        `.musix-pg:last-child{page-break-after:auto} svg{max-width:100%;height:auto}</style></head>` +
        `<body>${sections.map((s) => `<div class="musix-pg">${s}</div>`).join("")}</body></html>`,
    );
    w.document.close();
    w.focus();
    // Da tiempo a que el navegador maquete las fuentes antes de imprimir.
    setTimeout(() => w.print(), 700);
  }

  async function doExport() {
    const api = apiRef.current;
    if (!api?.score || orderedSel.length === 0) return;
    setBuilding(true);
    try {
      api.settings.display.scale = scale;
      api.settings.display.barsPerRow = barsPerRow > 0 ? barsPerRow : -1;
      api.updateSettings();
      if (mode === "multitrack") {
        // Un único render con las pistas alineadas y la impresión nativa de AlphaTab.
        api.renderTracks(api.score.tracks.filter((t) => selected.has(t.index)));
        await new Promise((r) => setTimeout(r, 300));
        const html = hostRef.current?.innerHTML ?? "";
        openPrintWindow([html]);
      } else {
        // Una pista tras otra → un documento con saltos de página entre pistas.
        const sections: string[] = [];
        for (const idx of orderedSel) {
          const t = api.score.tracks[idx];
          if (t) sections.push(await renderTracksCapture(api, [t]));
        }
        // Restaura la previsualización a la selección.
        api.renderTracks(api.score.tracks.filter((t) => selected.has(t.index)));
        openPrintWindow(sections);
      }
    } finally {
      setBuilding(false);
    }
  }

  const previewWidth = orientation === "portrait" ? 794 : 1123;

  return (
    <Modal open={open} onClose={onClose} title="Exportar PDF" width={920}>
      <div className="flex gap-4" style={{ minHeight: 420 }}>
        {/* Panel de controles */}
        <div className="w-64 shrink-0 space-y-4 overflow-y-auto pr-1" style={{ maxHeight: "70vh" }}>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Modo</div>
            <div className="flex gap-1">
              <button
                className={`flex-1 rounded-md px-2 py-1.5 text-xs ${mode === "multitrack" ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}
                onClick={() => setMode("multitrack")}
              >
                Multipista
              </button>
              <button
                className={`flex-1 rounded-md px-2 py-1.5 text-xs ${mode === "pertrack" ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}
                onClick={() => setMode("pertrack")}
              >
                Por pista
              </button>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              {mode === "multitrack"
                ? "Pistas en sistemas alineados (compases alineados)."
                : "Cada pista en sus propias páginas, concatenadas en un PDF."}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Pistas</span>
              <div className="flex gap-2 text-[11px]">
                <button className="text-slate-400 hover:text-accent" onClick={() => setSelected(new Set(tracks.map((t) => t.index)))}>Todas</button>
                <button className="text-slate-400 hover:text-accent" onClick={() => setSelected(new Set())}>Ninguna</button>
              </div>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {tracks.map((t) => (
                <label key={t.index} className="flex cursor-pointer items-center gap-2 rounded border border-ink-600 bg-ink-900/60 px-2 py-1 text-sm text-slate-200">
                  <input type="checkbox" className="accent-accent" checked={selected.has(t.index)} onChange={(e) => patchSel(t.index, e.target.checked)} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Tamaño (zoom)</div>
            <div className="flex flex-wrap gap-1">
              {SCALES.map((s) => (
                <button
                  key={s}
                  className={`rounded px-2 py-1 text-xs ${scale === s ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}
                  onClick={() => setScale(s)}
                >
                  {Math.round(s * 100)}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Compases por fila</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={12}
                value={barsPerRow}
                onChange={(e) => setBarsPerRow(Math.max(0, Math.min(12, Number(e.target.value))))}
                className="w-20 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent"
              />
              <span className="text-[10px] text-slate-500">0 = automático</span>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Orientación</div>
            <div className="flex gap-1">
              <button className={`flex-1 rounded-md px-2 py-1.5 text-xs ${orientation === "portrait" ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`} onClick={() => setOrientation("portrait")}>Vertical</button>
              <button className={`flex-1 rounded-md px-2 py-1.5 text-xs ${orientation === "landscape" ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`} onClick={() => setOrientation("landscape")}>Horizontal</button>
            </div>
          </div>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
            onClick={doExport}
            disabled={orderedSel.length === 0 || building || !ready}
          >
            <Icon name="export" size={15} /> {building ? "Preparando…" : "Exportar PDF"}
          </button>
          <p className="text-[10px] leading-snug text-slate-500">
            Se abrirá el diálogo de impresión del navegador: elige “Guardar como PDF”. La orientación
            debe coincidir con la elegida aquí.
          </p>
        </div>

        {/* Previsualización */}
        <div className="min-w-0 flex-1 overflow-auto rounded-md bg-[#e9e8e4] p-3" style={{ maxHeight: "70vh" }}>
          {!ready && <div className="p-6 text-center text-sm text-slate-500">Generando previsualización…</div>}
          <div className="mx-auto bg-white shadow" style={{ width: previewWidth * scale, maxWidth: "100%" }}>
            <div ref={hostRef} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
