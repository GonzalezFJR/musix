// Contenedor de una región de paneles (izquierda, derecha o inferior).
// Maneja su propio colapso y redimensionado. Las regiones laterales son verticales
// (anchura ajustable) y la inferior es horizontal (altura ajustable). El contenido
// (los bloques) se inyecta como children; las regiones se autoetiquetan por bloque.
import { type ReactNode } from "react";
import Icon from "../ui/Icon";
import Tooltip from "../ui/Tooltip";

type Side = "left" | "right" | "bottom";

interface Props {
  side: Side;
  size: number;
  onResize: (next: number) => void;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  children: ReactNode;
}

const MIN = { left: 180, right: 180, bottom: 90 };
const MAX = { left: 480, right: 480, bottom: 420 };

export default function RegionPanel({
  side,
  size,
  onResize,
  collapsed,
  onCollapsedChange,
  children,
}: Props) {
  const vertical = side !== "bottom";

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    // En derecha/abajo el asa va en el borde "interior": arrastrar hacia el centro
    // reduce el tamaño, por eso invertimos el signo del delta.
    const sign = side === "left" ? 1 : -1;
    let cur = size;
    const onMove = (ev: MouseEvent) => {
      cur = Math.min(MAX[side], Math.max(MIN[side], cur + (vertical ? ev.movementX : ev.movementY) * sign));
      onResize(cur);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Botón fino para expandir cuando está colapsada.
  if (collapsed) {
    const icon = side === "left" ? "chevronRight" : side === "right" ? "chevronLeft" : "chevronDown";
    const cls =
      side === "bottom"
        ? "flex h-6 w-full items-center justify-center border-t border-ink-600 bg-ink-800/50 text-slate-400 hover:bg-ink-700"
        : `flex w-6 shrink-0 items-center justify-center self-stretch bg-ink-800/50 text-slate-400 hover:bg-ink-700 ${
            side === "left" ? "border-r" : "border-l"
          } border-ink-600`;
    return (
      <Tooltip label="Mostrar panel" side={side === "left" ? "right" : "top"}>
        <button aria-label="Mostrar panel" className={cls} onClick={() => onCollapsedChange(false)}>
          <Icon name={icon} size={16} />
        </button>
      </Tooltip>
    );
  }

  const collapseIcon = side === "left" ? "chevronLeft" : side === "right" ? "chevronRight" : "chevronDown";
  const handle = (
    <div
      onMouseDown={startResize}
      className={`shrink-0 bg-ink-600 transition-colors hover:bg-accent ${
        vertical ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
      }`}
      title="Arrastra para redimensionar"
    />
  );

  const panel = (
    <div
      style={vertical ? { width: size } : { height: size }}
      className={`flex shrink-0 bg-ink-800/50 ${
        vertical
          ? `flex-col overflow-y-auto ${side === "left" ? "border-r" : "border-l"} border-ink-600`
          : "flex-row overflow-x-auto overflow-y-hidden border-t border-ink-600"
      }`}
    >
      <div
        className={`flex items-center justify-between px-2 py-1 ${
          vertical ? "" : "shrink-0 flex-col self-stretch border-r border-ink-700"
        }`}
      >
        <Tooltip label="Ocultar panel" side={vertical ? "top" : "right"}>
          <button aria-label="Ocultar panel" className="text-slate-400 hover:text-accent" onClick={() => onCollapsedChange(true)}>
            <Icon name={collapseIcon} size={16} />
          </button>
        </Tooltip>
      </div>
      <div
        className={
          vertical
            ? "flex flex-1 flex-col divide-y divide-ink-700"
            : "flex min-w-0 flex-1 flex-row divide-x divide-ink-700"
        }
      >
        {children}
      </div>
    </div>
  );

  // Asa en el borde interior (derecha del panel izquierdo, izquierda del derecho…).
  if (side === "left") return (<>{panel}{handle}</>);
  if (side === "right") return (<>{handle}{panel}</>);
  return (<>{handle}{panel}</>); // bottom: asa arriba
}
