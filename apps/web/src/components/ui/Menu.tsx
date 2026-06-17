// Menú emergente genérico: un disparador (icono) que abre un panel y se cierra al
// hacer clic fuera. Reutilizable para Exportar, Configuración de vista, etc.
import { useState, type ReactNode } from "react";

interface MenuProps {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
}

export default function Menu({ trigger, children, align = "right", width = 200 }: MenuProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="relative inline-flex">
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <>
          <div className="fixed inset-0 z-[1100]" onClick={close} />
          <div
            className={`absolute top-full z-[1101] mt-1.5 rounded-lg border border-ink-600 bg-ink-800 p-1.5 shadow-xl ${
              align === "right" ? "right-0" : "left-0"
            }`}
            style={{ width }}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

/** Fila de acción dentro de un Menu. */
export function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-200 hover:bg-ink-700"
    >
      {children}
    </button>
  );
}
