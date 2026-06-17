// Tooltip robusto: aparece tras un breve hover y se renderiza en un PORTAL a
// document.body con posición `fixed`, de modo que NUNCA lo recorta un contenedor
// con overflow (barras laterales, etc.). Calcula la posición desde el rect del
// disparador y, si el lado preferido no cabe, lo voltea y/o lo ajusta al viewport.
// Con `desc` muestra título en negrita + descripción.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "right" | "left";

interface TooltipProps {
  label: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
  side?: Side;
  delay?: number;
  wide?: boolean;
}

const GAP = 6; // separación entre disparador y tooltip
const MARGIN = 8; // margen mínimo respecto a los bordes del viewport

export default function Tooltip({ label, desc, children, side = "top", delay = 500, wide }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = () => {
    timer.current = setTimeout(() => setShow(true), delay);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
    setPos(null);
  };

  // Calcula la posición tras montar el tooltip (ya conocemos su tamaño real).
  useLayoutEffect(() => {
    if (!show || !wrapRef.current || !tipRef.current) return;
    const t = wrapRef.current.getBoundingClientRect();
    const w = tipRef.current.offsetWidth;
    const h = tipRef.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const candidate = (s: Side) => {
      switch (s) {
        case "top":
          return { left: t.left + t.width / 2 - w / 2, top: t.top - h - GAP };
        case "bottom":
          return { left: t.left + t.width / 2 - w / 2, top: t.bottom + GAP };
        case "left":
          return { left: t.left - w - GAP, top: t.top + t.height / 2 - h / 2 };
        case "right":
          return { left: t.right + GAP, top: t.top + t.height / 2 - h / 2 };
      }
    };
    const fits = (c: { left: number; top: number }) =>
      c.left >= MARGIN && c.left + w <= vw - MARGIN && c.top >= MARGIN && c.top + h <= vh - MARGIN;

    // Prueba el lado preferido, luego el opuesto, luego los demás; si ninguno cabe
    // del todo, usa el preferido y lo recorta al viewport.
    const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
    const order: Side[] = [side, opposite[side], "top", "bottom", "right", "left"];
    let chosen = candidate(side);
    for (const s of order) {
      const c = candidate(s);
      if (fits(c)) {
        chosen = c;
        break;
      }
    }
    // Recorte final para garantizar que queda dentro de la pantalla.
    const left = Math.min(Math.max(MARGIN, chosen.left), vw - MARGIN - w);
    const top = Math.min(Math.max(MARGIN, chosen.top), vh - MARGIN - h);
    setPos({ left, top });
  }, [show, side]);

  return (
    <span ref={wrapRef} className="relative inline-flex" onMouseEnter={enter} onMouseLeave={leave} onMouseDown={leave}>
      {children}
      {show &&
        label &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{
              position: "fixed",
              left: pos ? pos.left : -9999,
              top: pos ? pos.top : -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            className={`pointer-events-none z-[2000] rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] font-medium text-slate-200 shadow-lg ${
              wide || desc ? "w-56 whitespace-normal leading-snug" : "whitespace-nowrap"
            }`}
          >
            {desc ? (
              <>
                <span className="block font-semibold text-slate-100">{label}</span>
                <span className="mt-0.5 block font-normal text-slate-400">{desc}</span>
              </>
            ) : (
              label
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
