interface Props {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

/** Slider de velocidad de reproducción: x0.25 – x4 en pasos del 5%. */
export default function SpeedSlider({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2" title="Velocidad de reproducción (+/-)">
      <span className="text-xs text-slate-500">⏩</span>
      <input
        type="range"
        min={0.25}
        max={4}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(1)}
        className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:opacity-40"
      />
      <span className="w-11 text-right text-xs font-medium tabular-nums text-slate-200">
        {value.toFixed(2)}×
      </span>
    </div>
  );
}
