// Glifos de NOTACIÓN musical dibujados como SVG propios (no tipografía): figuras,
// puntillo, reguladores (crescendo/diminuendo), tresillo, ligadura y barras de
// repetición. Separados de `Icon` (iconos de interfaz) porque son lenguaje musical.
// Lienzo 24×24, `currentColor` para heredar el color del contenedor.
import type { SVGProps } from "react";

export type GlyphName =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "thirtysecond"
  | "dotted"
  | "crescendo"
  | "diminuendo"
  | "triplet"
  | "tie"
  | "repeatStart"
  | "repeatEnd";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const FILL = { fill: "currentColor", stroke: "none" };

// Cabeza rellena (negra/corchea…) y abierta (blanca/redonda), ligeramente inclinada.
const headFilled = (cx: number, cy: number) => (
  <ellipse {...FILL} cx={cx} cy={cy} rx={3.5} ry={2.6} transform={`rotate(-22 ${cx} ${cy})`} />
);
const headOpen = (cx: number, cy: number) => (
  <ellipse
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    cx={cx}
    cy={cy}
    rx={3.6}
    ry={2.7}
    transform={`rotate(-22 ${cx} ${cy})`}
  />
);
// Plica a la derecha de la cabeza, hacia arriba.
const stem = <path {...STROKE} d="M11.2 16.2V4.2" />;
// Corchete/banderola (una por figura), partiendo de la punta de la plica.
const flag = (y: number) => (
  <path {...STROKE} d={`M11.2 ${y}c3 0.8 4.2 3.4 2 5.6`} />
);

const GLYPHS: Record<GlyphName, React.ReactNode> = {
  whole: (
    <ellipse
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      cx={12}
      cy={13}
      rx={5}
      ry={3.2}
      transform="rotate(-12 12 13)"
    />
  ),
  half: (
    <>
      {headOpen(8, 17)}
      {stem}
    </>
  ),
  quarter: (
    <>
      {headFilled(8, 17)}
      {stem}
    </>
  ),
  eighth: (
    <>
      {headFilled(8, 17)}
      {stem}
      {flag(4.4)}
    </>
  ),
  sixteenth: (
    <>
      {headFilled(8, 17)}
      {stem}
      {flag(4.4)}
      {flag(8)}
    </>
  ),
  thirtysecond: (
    <>
      {headFilled(8, 17)}
      {stem}
      {flag(4.4)}
      {flag(7.4)}
      {flag(10.4)}
    </>
  ),
  dotted: (
    <>
      {headFilled(8, 17)}
      {stem}
      <circle {...FILL} cx={14.5} cy={17} r={1.5} />
    </>
  ),
  crescendo: <path {...STROKE} d="M20 6 L4 12 L20 18" />,
  diminuendo: <path {...STROKE} d="M4 6 L20 12 L4 18" />,
  triplet: (
    <>
      <path {...STROKE} d="M4 15q8 5 16 0" />
      <text
        x={12}
        y={11}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fontStyle="italic"
        fill="currentColor"
        stroke="none"
      >
        3
      </text>
    </>
  ),
  tie: <path {...STROKE} d="M4 13q8 7 16 0" />,
  repeatStart: (
    <>
      <rect {...FILL} x={4.5} y={4} width={2.6} height={16} rx={0.6} />
      <path {...STROKE} d="M9 4v16" />
      <circle {...FILL} cx={12.5} cy={9.5} r={1.4} />
      <circle {...FILL} cx={12.5} cy={14.5} r={1.4} />
    </>
  ),
  repeatEnd: (
    <>
      <circle {...FILL} cx={6} cy={9.5} r={1.4} />
      <circle {...FILL} cx={6} cy={14.5} r={1.4} />
      <path {...STROKE} d="M9.5 4v16" />
      <rect {...FILL} x={13.4} y={4} width={2.6} height={16} rx={0.6} />
    </>
  ),
};

interface Props extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: GlyphName;
  size?: number;
}

export default function MusicGlyph({ name, size = 20, className, ...rest }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...rest}>
      {GLYPHS[name]}
    </svg>
  );
}
