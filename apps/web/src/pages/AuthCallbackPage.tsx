import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

/** Recibe el token del redirect de Google (`/auth/callback#access_token=…`). */
export default function AuthCallbackPage() {
  const { adoptToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("access_token");
    if (!token) {
      setError(true);
      return;
    }
    adoptToken(token)
      .then(() => navigate("/", { replace: true }))
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full items-center justify-center text-slate-400">
      {error ? (
        <div className="text-center">
          <p className="mb-2 text-red-400">No se pudo completar el inicio de sesión.</p>
          <button className="btn-ghost" onClick={() => navigate("/login", { replace: true })}>
            Volver a intentarlo
          </button>
        </div>
      ) : (
        "Iniciando sesión…"
      )}
    </div>
  );
}
