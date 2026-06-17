import { useState } from "react";
import { Link } from "react-router-dom";

import type { Role } from "../lib/api";

// Panel de administración. Ruta protegida: solo accesible por admin loggueado
// (ver guard AdminProtected en App.tsx).
//
// TODO(DynamoDB): todos los datos de esta vista son PLACEHOLDER. La info real
// (usuarios, último login, recuento/longitud de proyectos, visitas) vivirá en
// DynamoDB (ver app/db/dynamo.py) y se servirá por endpoints de admin aún no
// implementados. La estructura de la UI ya está lista para enchufarla.

interface AdminProject {
  id: number;
  title: string;
  bars: number; // longitud en compases
  tracks: number;
  updatedAt: string;
}

interface AdminUser {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  projectCount: number;
  lastLogin: string;
  createdAt: string;
  projects: AdminProject[];
}

// ── Datos de ejemplo (se sustituirán por la respuesta del backend) ──────────
const MOCK_USERS: AdminUser[] = [
  {
    id: 1,
    email: "ana@example.com",
    displayName: "Ana López",
    role: "pro",
    projectCount: 3,
    lastLogin: "2026-06-15T18:22:00Z",
    createdAt: "2026-01-08T10:00:00Z",
    projects: [
      { id: 11, title: "Estudio en Mi menor", bars: 64, tracks: 2, updatedAt: "2026-06-15T17:40:00Z" },
      { id: 12, title: "Blues en La", bars: 48, tracks: 4, updatedAt: "2026-06-10T09:12:00Z" },
      { id: 13, title: "Bossa nova (borrador)", bars: 32, tracks: 3, updatedAt: "2026-05-28T20:05:00Z" },
    ],
  },
  {
    id: 2,
    email: "bruno@example.com",
    displayName: "Bruno Díaz",
    role: "free",
    projectCount: 1,
    lastLogin: "2026-06-14T08:05:00Z",
    createdAt: "2026-03-21T14:30:00Z",
    projects: [{ id: 21, title: "Mi primera canción", bars: 24, tracks: 1, updatedAt: "2026-06-14T08:00:00Z" }],
  },
  {
    id: 3,
    email: "carla@example.com",
    displayName: "Carla Ruiz",
    role: "pro",
    projectCount: 5,
    lastLogin: "2026-06-16T07:55:00Z",
    createdAt: "2025-11-02T11:15:00Z",
    projects: [
      { id: 31, title: "Suite barroca I", bars: 120, tracks: 6, updatedAt: "2026-06-16T07:50:00Z" },
      { id: 32, title: "Suite barroca II", bars: 96, tracks: 6, updatedAt: "2026-06-12T19:30:00Z" },
      { id: 33, title: "Jazz trío", bars: 88, tracks: 5, updatedAt: "2026-06-01T16:20:00Z" },
      { id: 34, title: "Balada", bars: 40, tracks: 3, updatedAt: "2026-05-19T12:10:00Z" },
      { id: 35, title: "Ejercicio de escalas", bars: 16, tracks: 1, updatedAt: "2026-04-30T10:00:00Z" },
    ],
  },
  {
    id: 4,
    email: "dev@example.com",
    displayName: "Dev",
    role: "admin",
    projectCount: 0,
    lastLogin: "2026-06-16T09:00:00Z",
    createdAt: "2025-09-01T09:00:00Z",
    projects: [],
  },
  {
    id: 5,
    email: "elena@example.com",
    displayName: "Elena Mota",
    role: "invited",
    projectCount: 0,
    lastLogin: "2026-05-02T13:40:00Z",
    createdAt: "2026-05-02T13:30:00Z",
    projects: [],
  },
];

// Estadísticas generales (placeholder). Vendrán agregadas del backend.
const MOCK_STATS = {
  totalVisits: 12840,
  visitsLast7d: 1320,
  totalUsers: MOCK_USERS.length,
  totalProjects: MOCK_USERS.reduce((n, u) => n + u.projectCount, 0),
  avgProjectBars: 62,
  longestProjectBars: 120,
};

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

function fmtDate(iso: string): string {
  // Formato corto y estable; evita locale/zona para que sea determinista.
  return iso.slice(0, 10);
}

function fmtDateTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = MOCK_USERS.find((u) => u.id === selectedId) ?? null;

  // Usuarios por tier para las estadísticas.
  const byRole = MOCK_USERS.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Panel de administración</h1>
          <p className="text-sm text-slate-400">Usuarios y estadísticas · solo administradores</p>
        </div>
        <Link to="/" className="btn-ghost">
          ← Volver
        </Link>
      </header>

      <div className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
        Datos de ejemplo. Se conectará a DynamoDB cuando esté disponible (usuarios, login,
        proyectos y visitas reales).
      </div>

      {/* ── Estadísticas generales ──────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-white">Estadísticas generales</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Visitas totales" value={MOCK_STATS.totalVisits.toLocaleString("es")} hint={`+${MOCK_STATS.visitsLast7d.toLocaleString("es")} últimos 7 días`} />
          <StatCard label="Usuarios" value={String(MOCK_STATS.totalUsers)} />
          <StatCard label="Proyectos" value={String(MOCK_STATS.totalProjects)} />
          <StatCard label="Longitud media" value={`${MOCK_STATS.avgProjectBars}`} hint="compases por proyecto" />
          <StatCard label="Proyecto más largo" value={`${MOCK_STATS.longestProjectBars}`} hint="compases" />
          <div className="card p-4">
            <div className="mb-1 text-sm text-slate-400">Usuarios por tier</div>
            <div className="flex flex-wrap gap-2">
              {(["admin", "pro", "free", "invited"] as Role[]).map((r) => (
                <span key={r} className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[r]}`}>
                  {ROLE_LABELS[r]}: {byRole[r] ?? 0}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Tabla de usuarios ───────────────────────────────────── */}
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
              {MOCK_USERS.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className={`cursor-pointer border-b border-ink-800 transition-colors hover:bg-ink-700/40 ${
                    selectedId === u.id ? "bg-ink-700/40" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">{u.displayName}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{u.projectCount}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">{fmtDateTime(u.lastLogin)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Haz clic en un usuario para ver el detalle.</p>
      </section>

      {/* ── Detalle del usuario seleccionado ────────────────────── */}
      {selected && (
        <section className="mt-8">
          <div className="card p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.displayName}</h2>
                <p className="text-sm text-slate-400">{selected.email}</p>
              </div>
              <button className="btn-ghost" onClick={() => setSelectedId(null)}>
                Cerrar
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-slate-500">Rol</div>
                <div className="mt-0.5"><RoleBadge role={selected.role} /></div>
              </div>
              <div>
                <div className="text-slate-500">Proyectos</div>
                <div className="mt-0.5 text-slate-200">{selected.projectCount}</div>
              </div>
              <div>
                <div className="text-slate-500">Último login</div>
                <div className="mt-0.5 text-slate-200">{fmtDateTime(selected.lastLogin)}</div>
              </div>
              <div>
                <div className="text-slate-500">Alta</div>
                <div className="mt-0.5 text-slate-200">{fmtDate(selected.createdAt)}</div>
              </div>
            </div>

            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Proyectos</h3>
            {selected.projects.length === 0 ? (
              <p className="text-sm text-slate-500">Este usuario no tiene proyectos.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 font-medium">Título</th>
                    <th className="py-2 text-right font-medium">Compases</th>
                    <th className="py-2 text-right font-medium">Pistas</th>
                    <th className="py-2 font-medium">Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.projects.map((p) => (
                    <tr key={p.id} className="border-b border-ink-800">
                      <td className="py-2 text-slate-200">{p.title}</td>
                      <td className="py-2 text-right tabular-nums text-slate-300">{p.bars}</td>
                      <td className="py-2 text-right tabular-nums text-slate-300">{p.tracks}</td>
                      <td className="py-2 tabular-nums text-slate-400">{fmtDateTime(p.updatedAt)}</td>
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
