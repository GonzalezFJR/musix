// Controles compactos del panel de edición: botones solo-símbolo con información
// por hover (nombre + descripción) y un grupo anclado +/− de una sola pieza.
// Objetivo: una barra de herramientas densa, intuitiva y sin texto.
import { type ReactNode } from "react";

import Icon from "../ui/Icon";
import Tooltip from "../ui/Tooltip";

type Side = "top" | "bottom" | "left" | "right";

interface ToolButtonProps {
  title: string;
  desc?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  /** Lado del tooltip. */
  side?: Side;
  /** Clase extra (p. ej. para ancho flexible). */
  className?: string;
}

/** Botón cuadrado solo-símbolo con tooltip informativo (nombre + descripción). */
export function ToolButton({
  title,
  desc,
  active,
  disabled,
  onClick,
  children,
  side = "top",
  className = "",
}: ToolButtonProps) {
  return (
    <Tooltip label={title} desc={desc} side={side}>
      <button
        type="button"
        aria-label={title}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={`flex h-8 min-w-8 items-center justify-center rounded transition-colors disabled:cursor-default disabled:opacity-40 ${
          active ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-300 hover:bg-ink-600"
        } ${className}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

interface PlusMinusProps {
  title: string;
  descMinus?: string;
  descPlus?: string;
  onMinus: () => void;
  onPlus: () => void;
  /** Contenido central anclado entre ambos botones (símbolo o valor). */
  center?: ReactNode;
  disabled?: boolean;
}

/** Grupo anclado de una pieza con − a la izquierda y + a la derecha. */
export function PlusMinus({ title, descMinus, descPlus, onMinus, onPlus, center, disabled }: PlusMinusProps) {
  const btn =
    "flex h-8 w-8 items-center justify-center text-slate-300 transition-colors hover:bg-ink-600 disabled:cursor-default disabled:opacity-40";
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded bg-ink-700">
      <Tooltip label={`${title} −`} desc={descMinus}>
        <button type="button" aria-label={`${title} menos`} className={btn} onClick={onMinus} disabled={disabled}>
          <Icon name="minus" size={14} />
        </button>
      </Tooltip>
      {center != null && (
        <span className="flex items-center justify-center px-1 text-[11px] text-slate-400">{center}</span>
      )}
      <Tooltip label={`${title} +`} desc={descPlus}>
        <button type="button" aria-label={`${title} más`} className={btn} onClick={onPlus} disabled={disabled}>
          <Icon name="plus" size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

/** Etiqueta pequeña de grupo en el panel. */
export function ToolLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{children}</div>;
}
