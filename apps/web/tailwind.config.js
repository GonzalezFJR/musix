/** @type {import('tailwindcss').Config} */

// Color respaldado por variable CSS (definida por tema en index.css). El triplete
// RGB en la variable permite que Tailwind aplique opacidades con <alpha-value>.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Superficies (fondos/paneles). Redefinidas por tema vía variables CSS.
        ink: {
          900: v("--ink-900"),
          800: v("--ink-800"),
          700: v("--ink-700"),
          600: v("--ink-600"),
          500: v("--ink-500"),
        },
        accent: {
          DEFAULT: v("--accent"),
          soft: v("--accent-soft"),
        },
        // Sobrescribimos los tonos de `slate` usados como texto para que se
        // inviertan en modo claro. El resto de la escala slate sigue por defecto.
        slate: {
          100: v("--slate-100"),
          200: v("--slate-200"),
          300: v("--slate-300"),
          400: v("--slate-400"),
          500: v("--slate-500"),
          600: v("--slate-600"),
          700: v("--slate-700"),
          800: v("--slate-800"),
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
