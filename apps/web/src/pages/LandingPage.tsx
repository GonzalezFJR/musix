import { Link } from "react-router-dom";

// Placeholder de landing pública. En desarrollo el login está desactivado
// (AUTH_DISABLED=true) y se entra directo al dashboard; esta página se activa en
// producción (gated por LANDING_ENABLED en el backend).
export default function LandingPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      {/* Logo animado: µ → corchea, 6 → bemol (transformación secuencial). */}
      <img
        src="/brand/musix-logo-animated.svg"
        alt="Musix"
        className="mb-6 h-28 w-auto"
        width={128}
        height={104}
      />
      <h1 className="text-5xl font-bold tracking-tight text-white">
        Mu<span className="text-accent">six</span>
      </h1>
      <p className="mt-4 max-w-lg text-lg text-slate-400">
        Editor de partituras y tablatura multipista en el navegador. Moderno, elegante y
        autoalojable.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        (Landing provisional — se activará en producción.)
      </p>
      <div className="mt-8 flex gap-3">
        <Link to="/login" className="btn-primary">
          Iniciar sesión
        </Link>
        <Link to="/login?mode=register" className="btn-ghost">
          Crear cuenta
        </Link>
      </div>
    </div>
  );
}
