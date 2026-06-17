// Panel "Escalas" (vive en una barra lateral). Permite asignar una escala/tonalidad
// a toda la pieza o a los compases señalados, ver/gestionar las zonas asignadas en una
// tabla con su color, abrir el círculo de quintas y transponer hacia la escala elegida.
import { rootName, type ChordNotation } from "../../lib/chords";
import { MODES, scaleColor, scaleDisplay, type ModeKey, type ScaleAssignment } from "../../lib/scales";
import Icon from "../ui/Icon";
import Tooltip from "../ui/Tooltip";
import { ToolLabel } from "./ToolControls";

export interface Picker {
  tonic: number;
  mode: ModeKey;
}

interface Props {
  notation: ChordNotation;
  assignments: ScaleAssignment[];
  /** Rango de compases señalado en la partitura (0-based) o null si no hay. */
  selection: { start: number; end: number } | null;
  scopeMode: "all" | "selection";
  onScopeModeChange: (m: "all" | "selection") => void;
  picker: Picker;
  onPickerChange: (p: Picker) => void;
  onAssign: () => void;
  onRemove: (bar: number) => void;
  onOpenCircle: () => void;
  onTranspose: () => void;
  onEditRow: (a: ScaleAssignment) => void;
  /** Las asignaciones/transposición solo se permiten en modo edición. */
  editMode: boolean;
}

export default function ScalesPanel({
  notation,
  assignments,
  selection,
  scopeMode,
  onScopeModeChange,
  picker,
  onPickerChange,
  onAssign,
  onRemove,
  onOpenCircle,
  onTranspose,
  onEditRow,
  editMode,
}: Props) {
  const selLabel = selection ? `Compases ${selection.start + 1}–${selection.end + 1}` : null;

  return (
    <div className="px-3 py-3">
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-soft">
        <Icon name="scale" size={15} /> Escalas
      </h4>
      <p className="mb-2 text-[11px] leading-snug text-slate-500">
        Tonalidades de la pieza por zonas. Marca las zonas con color y sirve para transponer.
      </p>

      {!editMode && (
        <div className="mb-3 rounded-md border border-ink-600 bg-ink-800/60 px-2.5 py-2 text-[11px] leading-snug text-slate-400">
          Para cambiar las escalas o transponer, activa el <b className="text-slate-200">modo edición</b>.
          <button
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-ink-700 px-2 py-1.5 text-xs text-slate-200 hover:bg-ink-600"
            onClick={onOpenCircle}
          >
            <Icon name="circle" size={15} /> Ver círculo de quintas
          </button>
        </div>
      )}

      {editMode && (
        <>
          {/* Ámbito */}
          <ToolLabel>Ámbito</ToolLabel>
          <div className="mb-2 flex gap-1">
            <button
              className={`flex-1 rounded px-2 py-1 text-xs ${
                scopeMode === "all" ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"
              }`}
              onClick={() => onScopeModeChange("all")}
            >
              Toda la pieza
            </button>
            <Tooltip label={selLabel ? "Aplicar solo a los compases señalados" : "Señala compases en la partitura (arrastra sobre ellos)"}>
              <button
                disabled={!selLabel}
                className={`flex-1 rounded px-2 py-1 text-xs disabled:opacity-40 ${
                  scopeMode === "selection" && selLabel
                    ? "bg-accent text-ink-900"
                    : "bg-ink-700 text-slate-300 hover:bg-ink-600"
                }`}
                onClick={() => onScopeModeChange("selection")}
              >
                {selLabel ?? "Compases señalados"}
              </button>
            </Tooltip>
          </div>

          {/* Selector tónica + modo */}
          <ToolLabel>Escala</ToolLabel>
          <div className="mb-2 flex items-center gap-1">
            <select
              aria-label="Tónica"
              className="rounded bg-ink-700 px-1.5 py-1 text-sm text-slate-200"
              value={picker.tonic}
              onChange={(e) => onPickerChange({ ...picker, tonic: Number(e.target.value) })}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {rootName(i, notation)}
                </option>
              ))}
            </select>
            <select
              aria-label="Modo"
              className="min-w-0 flex-1 rounded bg-ink-700 px-1.5 py-1 text-sm text-slate-200"
              value={picker.mode}
              onChange={(e) => onPickerChange({ ...picker, mode: e.target.value as ModeKey })}
            >
              {MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <Tooltip label="Círculo de quintas" desc="Elige escala y tonalidad en un círculo interactivo">
              <button
                aria-label="Círculo de quintas"
                className="flex h-8 w-8 items-center justify-center rounded bg-ink-700 text-slate-300 hover:bg-ink-600"
                onClick={onOpenCircle}
              >
                <Icon name="circle" size={17} />
              </button>
            </Tooltip>
          </div>

          <div className="mb-3 flex gap-1">
            <button
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-accent px-2 py-1.5 text-xs font-medium text-ink-900 hover:brightness-110"
              onClick={onAssign}
            >
              <Icon name="check" size={14} /> Asignar {scaleDisplay(picker.tonic, picker.mode, notation, { full: true })}
            </button>
            <Tooltip
              label="Transponer hacia esta escala"
              desc="Calcula los semitonos desde la escala actual de la zona hasta la elegida y reescribe las notas + armadura tras confirmar."
            >
              <button
                aria-label="Transponer hacia esta escala"
                className="flex h-8 w-8 items-center justify-center rounded border border-ink-500 text-slate-300 hover:bg-ink-600"
                onClick={onTranspose}
              >
                <Icon name="music" size={16} />
              </button>
            </Tooltip>
          </div>
        </>
      )}

      {/* Tabla de zonas asignadas */}
      <ToolLabel>Zonas asignadas</ToolLabel>
      {assignments.length === 0 ? (
        <p className="text-[11px] text-slate-500">Aún no hay escalas asignadas.</p>
      ) : (
        <div className="space-y-1">
          {assignments.map((a) => (
            <div
              key={`${a.startBar}-${a.endBar}-${a.tonic}-${a.mode}`}
              className="flex items-center gap-2 rounded border border-ink-700 bg-ink-900/40 px-2 py-1 text-xs"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: scaleColor(a.tonic, a.mode) }}
              />
              <button
                className="min-w-0 flex-1 text-left enabled:hover:text-accent disabled:cursor-default"
                title={editMode ? "Cargar esta escala en el selector" : undefined}
                disabled={!editMode}
                onClick={() => onEditRow(a)}
              >
                <span className="font-medium text-slate-200">
                  {scaleDisplay(a.tonic, a.mode, notation, { full: true })}
                </span>
                <span className="ml-1 text-slate-500">
                  · c. {a.startBar + 1}–{a.endBar + 1}
                </span>
              </button>
              {editMode && (
                <Tooltip label="Quitar esta zona">
                  <button
                    aria-label="Quitar zona"
                    className="text-slate-500 hover:text-red-400"
                    onClick={() => onRemove(a.startBar)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
