import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { THEMES, THEME_LABELS, useTheme, type Theme } from "../theme/ThemeContext";

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({
    display_name: user?.display_name ?? "",
    author_name: user?.author_name ?? "",
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    location: user?.location ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile(form);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  // Cambia el tema al instante y lo persiste en el perfil.
  async function chooseTheme(t: Theme) {
    setTheme(t);
    await updateProfile({ theme: t });
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Configuración</h1>
        <Link to="/" className="btn-ghost">
          ← Volver
        </Link>
      </header>

      {/* Apariencia */}
      <section className="card mb-6 p-6">
        <h2 className="mb-1 font-semibold text-white">Apariencia</h2>
        <p className="mb-4 text-sm text-slate-400">Elige el tema visual de la aplicación.</p>
        <div className="flex gap-3">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => chooseTheme(t)}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                theme === t
                  ? "border-accent bg-ink-700 text-white"
                  : "border-ink-500 text-slate-300 hover:border-accent/60"
              }`}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      {/* Perfil */}
      <section className="card mb-6 p-6">
        <h2 className="mb-4 font-semibold text-white">Perfil</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Nombre para mostrar</label>
            <input className="input" {...field("display_name")} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Nombre de autor</label>
            <input className="input" placeholder="Cómo firmas tus partituras" {...field("author_name")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Nombre</label>
              <input className="input" {...field("first_name")} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Apellidos</label>
              <input className="input" {...field("last_name")} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Ubicación</label>
            <input className="input" {...field("location")} />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            {saved && <span className="text-sm text-accent">Guardado ✓</span>}
          </div>
        </form>
      </section>

      {/* Cuenta */}
      <section className="card p-6">
        <h2 className="mb-4 font-semibold text-white">Cuenta</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="block text-slate-400">Email</span>
            <span className="text-slate-200">{user?.email}</span>
          </div>
          <div>
            <span className="block text-slate-400">Rol</span>
            <span className="text-slate-200 capitalize">{user?.role}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
