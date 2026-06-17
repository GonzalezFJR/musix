import { useState } from "react";
import { Link } from "react-router-dom";

import AuthLayout from "../components/ui/AuthLayout";
import CaptchaField from "../components/ui/CaptchaField";
import { ApiError, api } from "../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
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
      await api.forgotPassword(email, captcha);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      subtitle="Te enviaremos un enlace por email"
      footer={
        <Link to="/login" className="text-accent hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      {sent ? (
        <p className="text-center text-sm text-slate-300">
          Si ese email está registrado, te hemos enviado un enlace para restablecer la contraseña.
          Revisa tu bandeja de entrada.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input
            className="input"
            type="email"
            placeholder="Tu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <CaptchaField onToken={setCaptcha} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : "Enviar enlace"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
