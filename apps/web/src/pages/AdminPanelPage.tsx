import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  api,
  type AdminStats,
  type AdminUserDetail,
  type AdminUserSummary,
  type Role,
} from "../lib/api";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  pro: "Pro",
  free: "Free",
  invited: "Invitado",
};
const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-accent/20 text-accent",
  pro: "bg-violet-500/20 text-violet-300",
  free: "bg-slate-500/20 text-slate-300",
  invited: "bg-amber-500/20 text-amber-300",
};
const ALL_ROLES: Role[] = ["admin", "pro", "free", "invited"];

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}
function fmtDateTime(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "—";
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

export default function AdminPanelPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.adminStats().then(setStats).catch((e) => setError(String(e?.message ?? e)));
    api.adminUsers().then((r) => setUsers(r.users)).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  async function openUser(id: string) {
    setSelected(await api.adminUser(id));
  }

  async function changeRole(id: string, role: Role) {
    const updated = await api.adminUpdateUser(id, { role });
    setSelected(updated);
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, role } : u)));
    api.adminStats().then(setStats).catch(() => {});
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Panel de administración</h1>
          <p className="text-sm text-slate-400">Usuarios y estadísticas · solo administradores</p>
        </div>
        <Link to="/" className="btn-ghost">
          ← Volver a la app
        </Link>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Estadísticas ──────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-white">Estadísticas generales</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Usuarios" value={stats ? String(stats.user_count) : "…"} />
          <StatCard label="Proyectos" value={stats ? String(stats.project_count) : "…"} />
          <StatCard
            label="Logins recientes"
            value={stats ? String(stats.recent_logins.length) : "…"}
            hint="últimos registrados"
          />
          <div className="card p-4 sm:col-span-3">
            <div className="mb-1 text-sm text-slate-400">Usuarios por tier</div>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map((r) => (
                <span key={r} className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[r]}`}>
                  {ROLE_LABELS[r]}: {stats ? (stats as any)[`users_${r}`] ?? 0 : 0}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Logins recientes ──────────────────────────────────────── */}
      {stats && stats.recent_logins.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-white">Logins recientes</h2>
          <div className="card max-h-56 overflow-auto p-0">
            <table className="w-full text-sm">
              <tbody>
                {stats.recent_logins.map((e, i) => (
                  <tr key={i} className="border-b border-ink-800 last:border-0">
                    <td className="px-4 py-2 text-slate-300">{e.email || e.user_id}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                      {fmtDateTime(e.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Usuarios ──────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Usuarios</h2>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 text-right font-medium">Proyectos</th>
                <th className="px-4 py-3 font-medium">Último login</th>
                <th className="px-4 py-3 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => openUser(u.id)}
                  className={`cursor-pointer border-b border-ink-800 transition-colors hover:bg-ink-700/40 ${
                    selected?.id === u.id ? "bg-ink-700/40" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">{u.display_name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{u.project_count}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">{fmtDateTime(u.last_login)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">{fmtDate(u.created_at)}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Sin usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Haz clic en un usuario para ver el detalle y cambiar su rol.</p>
      </section>

      {/* ── Detalle ───────────────────────────────────────────────── */}
      {selected && (
        <section className="mt-8">
          <div className="card p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.display_name}</h2>
                <p className="text-sm text-slate-400">{selected.email}</p>
              </div>
              <button className="btn-ghost" onClick={() => setSelected(null)}>
                Cerrar
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-slate-500">Rol</div>
                <select
                  className="input mt-1 py-1"
                  value={selected.role}
                  onChange={(e) => changeRole(selected.id, e.target.value as Role)}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-slate-500">Proyectos</div>
                <div className="mt-0.5 text-slate-200">{selected.project_count}</div>
              </div>
              <div>
                <div className="text-slate-500">Último login</div>
                <div className="mt-0.5 text-slate-200">{fmtDateTime(selected.last_login)}</div>
              </div>
              <div>
                <div className="text-slate-500">Alta</div>
                <div className="mt-0.5 text-slate-200">{fmtDate(selected.created_at)}</div>
              </div>
            </div>

            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Proyectos
            </h3>
            {selected.projects.length === 0 ? (
              <p className="text-sm text-slate-500">Este usuario no tiene proyectos.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 font-medium">Título</th>
                    <th className="py-2 font-medium">Artista</th>
                    <th className="py-2 font-medium">Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.projects.map((p) => (
                    <tr key={p.id} className="border-b border-ink-800">
                      <td className="py-2 text-slate-200">{p.title}</td>
                      <td className="py-2 text-slate-400">{p.artist || "—"}</td>
                      <td className="py-2 tabular-nums text-slate-400">{fmtDateTime(p.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
