// Set de iconos SVG propios de Musix. Estilo line-art coherente con el tema:
// trazo `currentColor`, 24×24, esquinas redondeadas. Se colorean por `color`/`className`
// del contenedor. Los glifos de figuras musicales (♩ ♪ …) NO van aquí: son notación.
import type { SVGProps } from "react";

export type IconName =
  | "play"
  | "pause"
  | "stop"
  | "metronome"
  | "loop"
  | "undo"
  | "redo"
  | "save"
  | "export"
  | "edit"
  | "view"
  | "plus"
  | "minus"
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "eye"
  | "eyeOff"
  | "volume"
  | "volumeOff"
  | "dot"
  | "check"
  | "music"
  | "settings"
  | "upload"
  | "close"
  | "list"
  | "grid"
  | "text"
  | "chord"
  | "section"
  | "lyrics"
  | "arrowLeft"
  | "barAppend"
  | "barInsertBefore"
  | "barInsertAfter"
  | "trash"
  | "clef"
  | "keySignature"
  | "meter"
  | "scale"
  | "circle";

const P = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const FILLED = { fill: "currentColor", stroke: "none" };

// Cada icono es el contenido interno del <svg> (paths). Trazado sobre lienzo 24×24.
const PATHS: Record<IconName, React.ReactNode> = {
  play: <path {...FILLED} d="M8 5.5v13l11-6.5-11-6.5Z" />,
  pause: (
    <g {...FILLED}>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" />
    </g>
  ),
  stop: <rect {...FILLED} x="6" y="6" width="12" height="12" rx="2" />,
  metronome: (
    <g {...P}>
      <path d="M9 4h6l3 16H6L9 4Z" />
      <path d="M12 20 16 7" />
      <circle cx="16" cy="7" r="1.2" {...FILLED} />
    </g>
  ),
  loop: (
    <g {...P}>
      <path d="M4 9a5 5 0 0 1 5-5h7l-2.2-2.2M20 15a5 5 0 0 1-5 5H8l2.2 2.2" />
      <path d="M16 4l-2.2 2.2L16 8.4M8 20l2.2-2.2L8 15.6" />
    </g>
  ),
  undo: (
    <g {...P}>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h9a6 6 0 0 1 6 6v1" />
    </g>
  ),
  redo: (
    <g {...P}>
      <path d="m15 7 5 5-5 5" />
      <path d="M20 12h-9a6 6 0 0 0-6 6v1" />
    </g>
  ),
  save: (
    <g {...P}>
      <path d="M5 4h11l3 3v13H5V4Z" />
      <path d="M8 4v5h7V4" />
      <rect x="8" y="13" width="8" height="6" rx="0.5" />
    </g>
  ),
  export: (
    <g {...P}>
      <path d="M12 3v11" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 14v5h14v-5" />
    </g>
  ),
  edit: (
    <g {...P}>
      <path d="M14.5 5.5l4 4L8 20H4v-4L14.5 5.5Z" />
      <path d="M13 7l4 4" />
    </g>
  ),
  view: (
    <g {...P}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </g>
  ),
  plus: (
    <g {...P}>
      <path d="M12 6v12M6 12h12" />
    </g>
  ),
  minus: <path {...P} d="M6 12h12" />,
  chevronLeft: <path {...P} d="m14 6-6 6 6 6" />,
  chevronRight: <path {...P} d="m10 6 6 6-6 6" />,
  chevronDown: <path {...P} d="m6 10 6 6 6-6" />,
  eye: (
    <g {...P}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </g>
  ),
  eyeOff: (
    <g {...P}>
      <path d="M4 5l16 14" />
      <path d="M9.5 7A10 10 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a16 16 0 0 1-3 3.3M6.4 8.4A16 16 0 0 0 2.5 12S6 17.5 12 17.5a9 9 0 0 0 2.4-.3" />
    </g>
  ),
  volume: (
    <g {...P}>
      <path d="M4 9v6h3.5L13 19V5L7.5 9H4Z" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />
    </g>
  ),
  volumeOff: (
    <g {...P}>
      <path d="M4 9v6h3.5L13 19V5L7.5 9H4Z" />
      <path d="m16.5 9.5 4 5M20.5 9.5l-4 5" />
    </g>
  ),
  dot: <circle {...FILLED} cx="12" cy="12" r="3.2" />,
  check: <path {...P} d="m5 12.5 4.5 4.5L19 7" />,
  music: (
    <g {...P}>
      <path d="M9 17V5l10-2v12" />
      <circle cx="6.5" cy="17" r="2.5" {...FILLED} />
      <circle cx="16.5" cy="15" r="2.5" {...FILLED} />
    </g>
  ),
  settings: (
    <g {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    </g>
  ),
  upload: (
    <g {...P}>
      <path d="M12 16V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M5 16v4h14v-4" />
    </g>
  ),
  close: <path {...P} d="M6 6l12 12M18 6 6 18" />,
  list: (
    <g {...P}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" {...FILLED} />
      <circle cx="4" cy="12" r="1" {...FILLED} />
      <circle cx="4" cy="18" r="1" {...FILLED} />
    </g>
  ),
  grid: (
    <g {...P}>
      <rect x="3.5" y="4" width="7" height="6" rx="1" />
      <rect x="13.5" y="4" width="7" height="6" rx="1" />
      <rect x="3.5" y="14" width="7" height="6" rx="1" />
      <rect x="13.5" y="14" width="7" height="6" rx="1" />
    </g>
  ),
  text: (
    <g {...P}>
      <path d="M5 6h14M5 6v-1h14v1M12 6v13M9 19h6" />
    </g>
  ),
  chord: (
    <g {...P}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
      <path d="M9.7 5v14M14.3 5v14M5 9.7h14M5 14.3h14" />
      <circle cx="12" cy="12" r="1.4" {...FILLED} />
    </g>
  ),
  section: (
    <g {...P}>
      <path d="M7 4h10v16l-5-3.5L7 20V4Z" />
    </g>
  ),
  // Nota con subrayado de texto: letra de canción (distinto del icono "text").
  lyrics: (
    <g {...P}>
      <path d="M10 15V5l8-1.6V12" />
      <circle cx="7.5" cy="15" r="2.3" {...FILLED} />
      <circle cx="15.5" cy="13.5" r="2.3" {...FILLED} />
      <path d="M4 20h12" />
    </g>
  ),
  arrowLeft: (
    <g {...P}>
      <path d="M11 6l-6 6 6 6" />
      <path d="M5 12h14" />
    </g>
  ),
  // Flecha hasta una barra final: "añadir compás al final".
  barAppend: (
    <g {...P}>
      <path d="M3 12h11" />
      <path d="m10 8 4 4-4 4" />
      <path d="M19 5v14" />
    </g>
  ),
  // "+" a la izquierda de una barra: insertar compás antes.
  barInsertBefore: (
    <g {...P}>
      <path d="M7 8v8M3 12h8" />
      <path d="M17 5v14" />
    </g>
  ),
  // Barra con "+" a la derecha: insertar compás después.
  barInsertAfter: (
    <g {...P}>
      <path d="M7 5v14" />
      <path d="M17 8v8M13 12h8" />
    </g>
  ),
  trash: (
    <g {...P}>
      <path d="M5 7h14" />
      <path d="M10 7V5h4v2" />
      <path d="M6.5 7l1 12.5h9L17.5 7" />
      <path d="M10 10.5v6M14 10.5v6" />
    </g>
  ),
  // Clave (estilizada, tipo clave de sol).
  clef: (
    <g {...P}>
      <path d="M12 20V6a3 3 0 0 1 3 3c0 3-6 4-6 8a3 3 0 1 0 3-3" />
    </g>
  ),
  // Sostenido ♯ (armadura).
  keySignature: (
    <g {...P}>
      <path d="M9 4v15M14 5v15M6 9.5l11-2M6 15l11-2" />
    </g>
  ),
  // Compás (numerador/denominador).
  meter: (
    <g {...P}>
      <path d="M6 19 18 5" />
      <path d="M8 5h4M10 5v6" />
      <path d="M16 19h-4M14 13v6" />
    </g>
  ),
  // Escala: peldaños ascendentes (escala de notas).
  scale: (
    <g {...P}>
      <path d="M4 20h4v-4h4v-4h4v-4h4" />
      <path d="M4 20V8" />
    </g>
  ),
  // Círculo de quintas: círculo con radios.
  circle: (
    <g {...P}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" />
      <circle cx="12" cy="12" r="2" {...FILLED} />
    </g>
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
