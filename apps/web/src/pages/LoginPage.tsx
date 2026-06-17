import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import Logo from "../components/ui/Logo";
import { ApiError } from "../lib/api";

export default function LoginPage() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(
    params.get("mode") === "register" ? "register" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate("/", { replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, { display_name: displayName });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <Logo className="mx-auto mb-3 h-12 w-auto text-white" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Mu<span className="text-accent">six</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "login" ? "Inicia sesión para continuar" : "Crea tu cuenta"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className="input"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {mode === "register" && (
            <input
              className="input"
              type="text"
              placeholder="Nombre para mostrar (opcional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Entrar" : "Registrarse"}
          </button>
        </form>

        <button
          className="mt-4 w-full text-center text-sm text-slate-400 hover:text-accent"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}
