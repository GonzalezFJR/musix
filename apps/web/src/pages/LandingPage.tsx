import { Link } from "react-router-dom";

// Landing pública: punto de entrada del flujo (registro / login / contacto).
export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-bold tracking-tight text-white">
          Mu<span className="text-accent">six</span>
        </span>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/contact" className="text-slate-300 hover:text-accent">
            Contacto
          </Link>
          <Link to="/login" className="text-slate-300 hover:text-accent">
            Iniciar sesión
          </Link>
        </nav>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
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
        <div className="mt-8 flex gap-3">
          <Link to="/register" className="btn-primary">
            Crear cuenta
          </Link>
          <Link to="/login" className="btn-ghost">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
