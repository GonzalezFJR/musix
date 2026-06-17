// Exportación a PDF propia de la vista de letra: genera un documento limpio de
// cancionero (acordes + letra, sin pentagramas) y abre el diálogo de impresión del
// navegador ("Guardar como PDF"). Usa estilos en línea para no depender de Tailwind
// en la ventana de impresión.
import * as alphaTab from "@coderline/alphatab";
import { useState } from "react";

import type { ChordNotation } from "../../lib/chords";
import Icon from "../ui/Icon";
import Modal from "../ui/Modal";
import { buildBlocks, splitLines } from "./LyricsView";
import type { LyricsConfig } from "./viewConfig";

interface Props {
  open: boolean;
  onClose: () => void;
  track: alphaTab.model.Track | null | undefined;
  notation: ChordNotation;
  config: LyricsConfig;
  title: string;
}

const FONT_SIZES = [12, 14, 16, 18, 20];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function LyricsPdfModal({ open, onClose, track, notation, config, title }: Props) {
  const [fontSize, setFontSize] = useState(16);
  const [showChords, setShowChords] = useState(true);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  function buildHtml(): string {
    const blocks = buildBlocks(track, notation);
    const fs = fontSize;
    const chordSize = Math.round(fs * 0.82);
    const parts: string[] = [];
    for (const block of blocks) {
      if (block.title) {
        parts.push(
          `<h2 style="font-size:${Math.round(fs * 1.25)}px;font-weight:700;margin:18px 0 4px;">${esc(
            block.title,
          )}</h2>`,
        );
      }
      for (const line of splitLines(block, config)) {
        const bars = line
          .map((bc, ci) => {
            const beats = bc.beats
              .map((b) => {
                const chord = showChords
                  ? `<span style="display:block;height:1.1em;font-weight:700;color:#0369a1;font-size:${chordSize}px;white-space:nowrap;">${esc(
                      b.chord || " ",
                    )}</span>`
                  : "";
                const lyric = `<span style="display:block;white-space:pre;">${esc(
                  b.lyric || " ",
                )}</span>`;
                return `<span style="display:inline-flex;flex-direction:column;align-items:flex-start;padding:0 1px;">${chord}${lyric}</span>`;
              })
              .join("");
            const sep = ci > 0 ? `<span style="color:#cbd5e1;margin:0 4px;">|</span>` : "";
            return `${sep}<span style="display:inline-flex;align-items:flex-end;">${beats}</span>`;
          })
          .join("");
        parts.push(
          `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;margin:2px 0;line-height:1.25;">${bars}</div>`,
        );
      }
    }
    return parts.join("\n");
  }

  function doExport() {
    const w = window.open("", "_blank");
    if (!w) {
      alert("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.");
      return;
    }
    const body = buildHtml();
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
        `<style>@page{size:${orientation};margin:14mm} ` +
        `body{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#1f2937;font-size:${fontSize}px} ` +
        `h1{font-size:${Math.round(fontSize * 1.6)}px;margin:0 0 12px}</style></head>` +
        `<body><h1>${esc(title)}</h1>${body}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  return (
    <Modal open={open} onClose={onClose} title="Exportar letra (PDF)" width={760}>
      <div className="flex gap-4" style={{ minHeight: 360 }}>
        {/* Controles */}
        <div className="w-56 shrink-0 space-y-4">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Tamaño de letra</div>
            <div className="flex flex-wrap gap-1">
              {FONT_SIZES.map((s) => (
                <button
                  key={s}
                  className={`rounded px-2.5 py-1 text-xs ${
                    fontSize === s ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"
                  }`}
                  onClick={() => setFontSize(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="accent-accent"
              checked={showChords}
              onChange={(e) => setShowChords(e.target.checked)}
            />
            Mostrar acordes
          </label>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Orientación</div>
            <div className="flex gap-1">
              <button
                className={`flex-1 rounded-md px-2 py-1.5 text-xs ${orientation === "portrait" ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}
                onClick={() => setOrientation("portrait")}
              >
                Vertical
              </button>
              <button
                className={`flex-1 rounded-md px-2 py-1.5 text-xs ${orientation === "landscape" ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}
                onClick={() => setOrientation("landscape")}
              >
                Horizontal
              </button>
            </div>
          </div>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
            onClick={doExport}
            disabled={!track}
          >
            <Icon name="export" size={15} /> Exportar PDF
          </button>
          <p className="text-[10px] leading-snug text-slate-500">
            Se abrirá el diálogo de impresión: elige “Guardar como PDF”. Los saltos de línea y las
            secciones siguen la configuración de la vista de letra.
          </p>
        </div>

        {/* Previsualización (paper) */}
        <div className="min-w-0 flex-1 overflow-auto rounded-md bg-[#e9e8e4] p-3" style={{ maxHeight: "60vh" }}>
          <div
            className="mx-auto bg-white p-6 font-mono text-slate-800 shadow"
            style={{ width: orientation === "portrait" ? 520 : 720, fontSize, maxWidth: "100%" }}
            dangerouslySetInnerHTML={{ __html: `<h1 style="font-size:${Math.round(fontSize * 1.6)}px;margin:0 0 12px;font-weight:700;">${esc(title)}</h1>${buildHtml()}` }}
          />
        </div>
      </div>
    </Modal>
  );
}
