import { useState, type ReactNode } from "react";

interface Props {
  label: ReactNode;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
}

/** Botón que despliega un panel; se cierra al hacer clic fuera. */
export default function Popover({ label, title, disabled, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className="rounded-md bg-ink-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-ink-600 disabled:opacity-40"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={title}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[1100]" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-[1101] mt-2 max-h-[75vh] w-72 overflow-y-auto bg-ink-800 p-4 text-sm shadow-xl">{children}</div>
        </>
      )}
    </div>
  );
}

/** Grupo de opciones tipo "segmented control". */
export function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              value === o.value
                ? "bg-accent text-ink-900"
                : "bg-ink-700 text-slate-300 hover:bg-ink-600"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
