import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  onPlayPause?: () => void;
  onSpeedUp?: () => void;
  onSpeedDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onHome?: () => void;
  onToggleMetronome?: () => void;
  onToggleLoop?: () => void;
  onToggleEdit?: () => void;
  onDigit?: (d: number) => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPlace?: () => void;
  onDot?: () => void;
  onEditLyric?: () => void;
}

function isTyping(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
}

/** Atajos globales del editor de partitura. */
export function useShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const h = ref.current;

      // Deshacer / rehacer (también funciona con foco en controles).
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (isTyping(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) h.onRedo?.();
        else h.onUndo?.();
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key >= "0" && e.key <= "9") {
        h.onDigit?.(Number(e.key));
        return;
      }
      switch (e.key) {
        case " ":
          e.preventDefault();
          // Quita el foco de cualquier botón para que el espacio no lo "re-pulse"
          // y siga sirviendo para play/pausa en pulsaciones siguientes.
          (document.activeElement as HTMLElement | null)?.blur();
          h.onPlayPause?.();
          break;
        case "+":
        case "=":
          e.preventDefault();
          h.onSpeedUp?.();
          break;
        case "-":
        case "_":
          e.preventDefault();
          h.onSpeedDown?.();
          break;
        case "ArrowRight":
          e.preventDefault();
          h.onArrowRight?.();
          break;
        case "ArrowLeft":
          e.preventDefault();
          h.onArrowLeft?.();
          break;
        case "ArrowUp":
          e.preventDefault();
          h.onArrowUp?.();
          break;
        case "ArrowDown":
          e.preventDefault();
          h.onArrowDown?.();
          break;
        case "Home":
          e.preventDefault();
          h.onHome?.();
          break;
        case "Enter":
          e.preventDefault();
          h.onPlace?.();
          break;
        case ".":
          e.preventDefault();
          h.onDot?.();
          break;
        case "Delete":
        case "Backspace":
          h.onDelete?.();
          break;
        case "e":
        case "E":
          h.onToggleEdit?.();
          break;
        case "m":
        case "M":
          h.onToggleMetronome?.();
          break;
        case "l":
        case "L":
          h.onToggleLoop?.();
          break;
        case "t":
        case "T":
          h.onEditLyric?.();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
