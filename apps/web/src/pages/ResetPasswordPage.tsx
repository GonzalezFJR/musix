import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import AuthLayout from "../components/ui/AuthLayout";
import CaptchaField from "../components/ui/CaptchaField";
import { ApiError, api } from "../lib/api";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!captcha) {
      setError("Completa el captcha");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password, captcha);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Nueva contraseña"
      footer={
        <Link to="/login" className="text-accent hover:underline">
          Ir a iniciar sesión
        </Link>
      }
    >
      {!token ? (
        <p className="text-center text-sm text-red-400">Enlace inválido.</p>
      ) : done ? (
        <p className="text-center text-sm text-slate-300">
          Contraseña actualizada. Ya puedes iniciar sesión.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input
            className="input"
            type="password"
            placeholder="Nueva contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoFocus
          />
          <CaptchaField onToken={setCaptcha} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : "Cambiar contraseña"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
