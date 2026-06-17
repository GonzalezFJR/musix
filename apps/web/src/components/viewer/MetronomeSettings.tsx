import type { AccentPattern, MetronomeConfig, Subdivision } from "../../lib/metronome";
import Icon from "../ui/Icon";
import Tooltip from "../ui/Tooltip";
import Popover, { OptionGroup } from "./Popover";

interface Props {
  enabled: boolean;
  onToggle: () => void;
  config: MetronomeConfig;
  onChange: (c: MetronomeConfig) => void;
  disabled?: boolean;
}

export default function MetronomeSettings({
  enabled,
  onToggle,
  config,
  onChange,
  disabled,
}: Props) {
  return (
    <div className="flex items-center">
      <Tooltip label="Metrónomo (M)">
        <button
          className={`flex h-8 w-8 items-center justify-center rounded-l-md transition-colors disabled:opacity-40 ${
            enabled ? "bg-accent text-ink-900" : "text-slate-300 hover:bg-ink-600"
          }`}
          onClick={onToggle}
          disabled={disabled}
        >
          <Icon name="metronome" size={16} />
        </button>
      </Tooltip>
      <div className="-ml-px">
        <Popover label={<Icon name="chevronDown" size={12} />} title="Opciones del metrónomo" disabled={disabled}>
          <OptionGroup<Subdivision>
            label="Marcar"
            value={config.subdivision}
            onChange={(subdivision) => onChange({ ...config, subdivision })}
            options={[
              { value: "half", label: "Blancas" },
              { value: "quarter", label: "Negras" },
              { value: "eighth", label: "Corcheas" },
              { value: "sixteenth", label: "Semicorcheas" },
            ]}
          />
          <OptionGroup<AccentPattern>
            label="Acentos"
            value={config.accent}
            onChange={(accent) => onChange({ ...config, accent })}
            options={[
              { value: "none", label: "Sin acento" },
              { value: "first", label: "1er pulso" },
              { value: "first-third", label: "1º y 3º" },
            ]}
          />
          <p className="text-xs leading-snug text-slate-500">
            Click track propio (acentos y subdivisiones). Se alinea al inicio de reproducción y
            al tempo base.
          </p>
        </Popover>
      </div>
    </div>
  );
}
