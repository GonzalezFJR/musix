import Icon from "../ui/Icon";
import Popover, { OptionGroup } from "./Popover";
import {
  BLOCK_LABELS,
  BLOCK_ORDER,
  REGION_OPTIONS,
  type Alignment,
  type FrameKind,
  type LayoutConfig,
  type LyricsBreakMode,
  type Orientation,
  type Region,
  type ViewConfig,
  type ViewMode,
} from "./viewConfig";

interface Props {
  view: ViewConfig;
  onChange: (v: ViewConfig) => void;
  layout: LayoutConfig;
  onLayoutChange: (l: LayoutConfig) => void;
  disabled?: boolean;
}

export default function ViewSettings({ view, onChange, layout, onLayoutChange, disabled }: Props) {
  const set = (patch: Partial<ViewConfig>) => onChange({ ...view, ...patch });
  const setLyrics = (patch: Partial<ViewConfig["lyrics"]>) =>
    onChange({ ...view, lyrics: { ...view.lyrics, ...patch } });
  const place = (block: keyof LayoutConfig["placement"], region: Region) =>
    onLayoutChange({ ...layout, placement: { ...layout.placement, [block]: region } });
  const isLyrics = view.mode === "lyrics";

  return (
    <Popover
      label={
        <span className="flex items-center gap-1.5">
          <Icon name="view" size={15} /> Vista
        </span>
      }
      title="Opciones de visualización"
      disabled={disabled}
    >
      <OptionGroup<ViewMode>
        label="Vista"
        value={view.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: "score", label: "Partitura" },
          { value: "lyrics", label: "Letra" },
        ]}
      />

      {isLyrics && (
        <>
          <OptionGroup<LyricsBreakMode>
            label="Saltos de línea"
            value={view.lyrics.breakMode}
            onChange={(breakMode) =>
              // Al pasar a "custom", siembra los saltos desde la cadencia "cada N".
              breakMode === "custom" && view.lyrics.breakMode !== "custom"
                ? setLyrics({ breakMode, customBreaks: seedBreaks(view.lyrics.barsPerLine) })
                : setLyrics({ breakMode })
            }
            options={[
              { value: "every", label: "Cada N compases" },
              { value: "custom", label: "Personalizado" },
            ]}
          />
          {view.lyrics.breakMode === "every" ? (
            <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
              Compases por línea
              <input
                type="number"
                min={1}
                max={16}
                value={view.lyrics.barsPerLine}
                onChange={(e) =>
                  setLyrics({ barsPerLine: Math.max(1, Math.min(16, Number(e.target.value))) })
                }
                className="w-16 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-right"
              />
            </label>
          ) : (
            <p className="text-[11px] leading-snug text-slate-500">
              Activa o quita saltos con el botón <b>↵</b> al inicio de cada compás en la propia vista.
            </p>
          )}
          <div className="my-3 border-t border-ink-700" />
        </>
      )}

      {!isLyrics && (
        <OptionGroup<FrameKind>
          label="Marco"
          value={view.frame}
          onChange={(frame) => set({ frame })}
          options={[
            { value: "extended", label: "Extendido" },
            { value: "central", label: "Central" },
            { value: "folio", label: "Folio" },
          ]}
        />
      )}

      {!isLyrics && view.frame === "folio" && (
        <OptionGroup<Orientation>
          label="Orientación del folio"
          value={view.orientation}
          onChange={(orientation) => set({ orientation })}
          options={[
            { value: "portrait", label: "Vertical" },
            { value: "landscape", label: "Apaisado" },
          ]}
        />
      )}

      {!isLyrics && (
        <OptionGroup<Alignment>
          label="Alineación de compases"
          value={view.alignment}
          onChange={(alignment) => set({ alignment })}
          options={[
            { value: "normal", label: "Normal" },
            { value: "ordered", label: "Ordenada" },
          ]}
        />
      )}

      {!isLyrics && view.alignment === "ordered" && (
        <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
          Compases por fila
          <input
            type="number"
            min={1}
            max={12}
            value={view.barsPerRow}
            onChange={(e) => set({ barsPerRow: Math.max(1, Math.min(12, Number(e.target.value))) })}
            className="w-16 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-right"
          />
        </label>
      )}

      <div className="my-3 border-t border-ink-700" />
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Disposición de paneles
      </div>
      <p className="mb-2 text-[11px] leading-snug text-slate-500">
        Coloca cada bloque a la izquierda, derecha, abajo u oculto. Cada barra aparece al asignarle
        un bloque.
      </p>
      {BLOCK_ORDER.map((block) => (
        <OptionGroup<Region>
          key={block}
          label={BLOCK_LABELS[block]}
          value={layout.placement[block]}
          onChange={(region) => place(block, region)}
          options={REGION_OPTIONS}
        />
      ))}
    </Popover>
  );
}

// Saltos iniciales para el modo "custom": cada N compases (índices 0, N, 2N…).
// Aproximación sin conocer el nº total de compases; los compases sin salto se ajustan
// luego en la propia vista. 256 cubre canciones largas de sobra.
function seedBreaks(barsPerLine: number): number[] {
  const step = Math.max(1, barsPerLine);
  const out: number[] = [];
  for (let i = step; i < 256; i += step) out.push(i);
  return out;
}
