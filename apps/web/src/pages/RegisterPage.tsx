import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import AuthLayout from "../components/ui/AuthLayout";
import CaptchaField from "../components/ui/CaptchaField";
import GoogleButton from "../components/ui/GoogleButton";
import { usePublicConfig } from "../config/PublicConfigContext";
import { ApiError } from "../lib/api";

export default function RegisterPage() {
  const { register, user } = useAuth();
  const { registration_enabled } = usePublicConfig();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) navigate("/", { replace: true });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!captcha) {
      setError("Completa el captcha");
      return;
    }
    setBusy(true);
    try {
      await register(email, password, captcha, { display_name: displayName });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Empieza a componer con Musix"
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      {!registration_enabled ? (
        <p className="text-center text-sm text-slate-400">El registro está deshabilitado.</p>
      ) : (
        <>
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
            <input
              className="input"
              type="text"
              placeholder="Nombre para mostrar (opcional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <CaptchaField onToken={setCaptcha} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "…" : "Registrarse"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-ink-600" />o<span className="h-px flex-1 bg-ink-600" />
          </div>
          <GoogleButton label="Regístrate con Google" />
        </>
      )}
    </AuthLayout>
  );
}
