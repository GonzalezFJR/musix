// Interruptor deslizante (slide-check) con etiqueta. Usado para "Modo edición".
interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-2 disabled:opacity-40"
    >
      {label && (
        <span className={`text-xs font-medium ${checked ? "text-accent" : "text-slate-400"}`}>{label}</span>
      )}
      <span
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-ink-600 group-hover:bg-ink-500"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
