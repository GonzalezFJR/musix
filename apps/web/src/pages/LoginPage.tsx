import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import AuthLayout from "../components/ui/AuthLayout";
import GoogleButton from "../components/ui/GoogleButton";
import { ApiError } from "../lib/api";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) navigate("/", { replace: true });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Inicia sesión"
      subtitle="Bienvenido de nuevo a Musix"
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/register" className="text-accent hover:underline">
            Regístrate
          </Link>
        </>
      }
    >
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
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "…" : "Entrar"}
        </button>
      </form>

      <div className="mt-3 text-center">
        <Link to="/forgot-password" className="text-sm text-slate-400 hover:text-accent">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-ink-600" />o<span className="h-px flex-1 bg-ink-600" />
      </div>
      <GoogleButton />
    </AuthLayout>
  );
}
