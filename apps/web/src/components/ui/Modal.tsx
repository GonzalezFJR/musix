// Modal genérico centrado con telón de fondo. Cierra al pulsar Escape, al hacer
// clic fuera o en la X. Coherente con el tema (ink oscuro, borde sutil).
import { useEffect, type ReactNode } from "react";
import Icon from "./Icon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export default function Modal({ open, onClose, title, children, width = 440 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[85vh] overflow-y-auto rounded-xl border border-ink-600 bg-ink-800 shadow-2xl"
        style={{ width }}
      >
        <div className="flex items-center justify-between border-b border-ink-600 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-ink-600 hover:text-slate-200"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
