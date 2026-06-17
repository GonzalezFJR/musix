import { useState } from "react";
import { Link } from "react-router-dom";

import AuthLayout from "../components/ui/AuthLayout";
import CaptchaField from "../components/ui/CaptchaField";
import { ApiError, api } from "../lib/api";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
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
      await api.contact({ name, email, subject, message, captchaToken: captcha });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Contacto"
      subtitle="¿Dudas o sugerencias? Escríbenos"
      footer={
        <Link to="/landing" className="text-accent hover:underline">
          Volver
        </Link>
      }
    >
      {sent ? (
        <p className="text-center text-sm text-slate-300">
          ¡Gracias! Hemos recibido tu mensaje y te responderemos pronto.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input
            className="input"
            type="text"
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <input
            className="input"
            type="email"
            placeholder="Tu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="text"
            placeholder="Asunto"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className="input min-h-[120px]"
            placeholder="Tu mensaje"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          <CaptchaField onToken={setCaptcha} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : "Enviar"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
