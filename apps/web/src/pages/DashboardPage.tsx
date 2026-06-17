import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import Logo from "../components/ui/Logo";
import { api, type Folder, type ProjectSummary } from "../lib/api";

const DRAG_KEY = "application/x-musix-project";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);

  async function refresh() {
    const [f, p] = await Promise.all([api.listFolders(), api.listProjects()]);
    setFolders(f);
    setProjects(p);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  // Mapa de hijos por carpeta padre para renderizar el árbol.
  const childFolders = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const key = f.parent_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [folders]);

  const visibleProjects = projects.filter((p) => p.folder_id === currentFolder);
  const subFolders = childFolders.get(currentFolder) ?? [];

  // Ruta de migas hasta la carpeta actual.
  const breadcrumb = useMemo(() => {
    const path: Folder[] = [];
    let id = currentFolder;
    const byId = new Map(folders.map((f) => [f.id, f]));
    while (id != null) {
      const f = byId.get(id);
      if (!f) break;
      path.unshift(f);
      id = f.parent_id;
    }
    return path;
  }, [currentFolder, folders]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const p = await api.createProject(newTitle.trim(), "", currentFolder);
      navigate(`/projects/${p.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function createFolder() {
    const name = window.prompt("Nombre de la carpeta:");
    if (!name?.trim()) return;
    await api.createFolder(name.trim(), currentFolder);
    refresh();
  }

  async function renameFolder(folder: Folder) {
    const name = window.prompt("Renombrar carpeta:", folder.name);
    if (!name?.trim() || name === folder.name) return;
    await api.updateFolder(folder.id, { name: name.trim() });
    refresh();
  }

  async function removeFolder(folder: Folder) {
    if (!confirm(`¿Eliminar la carpeta "${folder.name}"? Sus proyectos pasarán a la raíz.`)) return;
    await api.deleteFolder(folder.id);
    if (currentFolder === folder.id) setCurrentFolder(folder.parent_id);
    refresh();
  }

  async function removeProject(id: string) {
    if (!confirm("¿Eliminar este proyecto?")) return;
    await api.deleteProject(id);
    refresh();
  }

  async function moveProject(projectId: string, folderId: string | null) {
    await api.moveProject(projectId, folderId);
    refresh();
  }

  // ── Drag & drop ───────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, projectId: string) {
    e.dataTransfer.setData(DRAG_KEY, String(projectId));
    e.dataTransfer.effectAllowed = "move";
  }
  function onDropTo(e: React.DragEvent, folderId: string | null) {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(DRAG_KEY);
    if (raw) moveProject(raw, folderId);
  }
  function allowDrop(e: React.DragEvent) {
    if (e.dataTransfer.types.includes(DRAG_KEY)) e.preventDefault();
  }

  // Render recursivo del árbol de carpetas en la barra lateral.
  function FolderTree({ parentId, depth }: { parentId: string | null; depth: number }) {
    const items = childFolders.get(parentId) ?? [];
    return (
      <ul className={depth > 0 ? "ml-3 border-l border-ink-600 pl-2" : ""}>
        {items.map((f) => {
          const active = currentFolder === f.id;
          const isDrop = dropTarget === f.id;
          return (
            <li key={f.id}>
              <div
                className={`group flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors ${
                  active ? "bg-ink-600 text-white" : "text-slate-300 hover:bg-ink-700"
                } ${isDrop ? "ring-2 ring-accent" : ""}`}
                onClick={() => setCurrentFolder(f.id)}
                onDragOver={(e) => {
                  allowDrop(e);
                  setDropTarget(f.id);
                }}
                onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
                onDrop={(e) => onDropTo(e, f.id)}
              >
                <span className="truncate">📁 {f.name}</span>
                <span className="ml-auto hidden gap-1 group-hover:flex">
                  <button
                    className="text-xs text-slate-500 hover:text-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      renameFolder(f);
                    }}
                    title="Renombrar"
                  >
                    ✎
                  </button>
                  <button
                    className="text-xs text-slate-500 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFolder(f);
                    }}
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </span>
              </div>
              <FolderTree parentId={f.id} depth={depth + 1} />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior: logo + nuevo proyecto + cuenta. Fuera del panel de proyectos. */}
      <header className="flex flex-wrap items-center gap-3 border-b border-ink-700 bg-ink-800 px-6 py-3">
        <h1 className="flex items-center gap-2 text-lg font-bold text-white">
          <Logo className="h-7 w-auto" />
          <span>
            Mu<span className="text-accent">six</span>
          </span>
        </h1>
        <form onSubmit={createProject} className="ml-2 flex flex-1 items-center gap-2 sm:max-w-md">
          <input
            className="input"
            placeholder="Título del nuevo proyecto…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button className="btn-primary whitespace-nowrap" disabled={creating || !newTitle.trim()}>
            + Nuevo proyecto
          </button>
        </form>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <Link to="/settings" className="hover:text-accent">
            Ajustes
          </Link>
          {user?.role === "admin" && (
            <>
              <Link to="/adminpanel" className="hover:text-accent">
                Admin
              </Link>
              <Link to="/docs" className="hover:text-accent">
                Docs
              </Link>
            </>
          )}
          <span className="hidden sm:inline">{user?.display_name}</span>
          <button className="btn-ghost" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Barra lateral: árbol de carpetas. */}
        <aside className="w-60 shrink-0 overflow-auto border-r border-ink-700 bg-ink-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Carpetas
            </span>
            <button className="text-xs text-accent hover:underline" onClick={createFolder}>
              + Carpeta
            </button>
          </div>
          <div
            className={`mb-1 cursor-pointer rounded-md px-2 py-1 text-sm transition-colors ${
              currentFolder === null ? "bg-ink-600 text-white" : "text-slate-300 hover:bg-ink-700"
            } ${dropTarget === "root" ? "ring-2 ring-accent" : ""}`}
            onClick={() => setCurrentFolder(null)}
            onDragOver={(e) => {
              allowDrop(e);
              setDropTarget("root");
            }}
            onDragLeave={() => setDropTarget((t) => (t === "root" ? null : t))}
            onDrop={(e) => onDropTo(e, null)}
          >
            🏠 Todos los proyectos
          </div>
          <FolderTree parentId={null} depth={0} />
        </aside>

        {/* Panel central: proyectos de la carpeta actual. */}
        <main className="min-w-0 flex-1 overflow-auto px-6 py-5">
          {/* Migas de pan. */}
          <nav className="mb-4 flex items-center gap-1 text-sm text-slate-400">
            <button className="hover:text-accent" onClick={() => setCurrentFolder(null)}>
              Inicio
            </button>
            {breadcrumb.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <span className="text-slate-600">/</span>
                <button className="hover:text-accent" onClick={() => setCurrentFolder(f.id)}>
                  {f.name}
                </button>
              </span>
            ))}
          </nav>

          {loading ? (
            <p className="text-slate-400">Cargando…</p>
          ) : (
            <>
              {/* Subcarpetas de la carpeta actual (navegables y drop targets). */}
              {subFolders.length > 0 && (
                <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {subFolders.map((f) => (
                    <li
                      key={f.id}
                      className={`card flex cursor-pointer items-center gap-2 p-4 transition-colors hover:border-accent/60 ${
                        dropTarget === f.id ? "ring-2 ring-accent" : ""
                      }`}
                      onClick={() => setCurrentFolder(f.id)}
                      onDragOver={(e) => {
                        allowDrop(e);
                        setDropTarget(f.id);
                      }}
                      onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
                      onDrop={(e) => onDropTo(e, f.id)}
                    >
                      <span className="text-xl">📁</span>
                      <span className="truncate font-medium text-white">{f.name}</span>
                    </li>
                  ))}
                </ul>
              )}

              {visibleProjects.length === 0 && subFolders.length === 0 ? (
                <p className="text-slate-400">
                  Esta carpeta está vacía. Crea un proyecto o arrastra uno aquí.
                </p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleProjects.map((p) => (
                    <li
                      key={p.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, p.id)}
                      className="card group cursor-grab p-5 transition-colors hover:border-accent/60 active:cursor-grabbing"
                    >
                      <Link to={`/projects/${p.id}`} className="block">
                        <h3 className="truncate font-semibold text-white">{p.title}</h3>
                        <p className="truncate text-sm text-slate-400">{p.artist || "—"}</p>
                        <p className="mt-3 text-xs text-slate-500">
                          {p.original_filename ? `📄 ${p.original_filename}` : p.has_score ? "♪ Partitura" : "Vacío"}
                        </p>
                      </Link>
                      <button
                        className="mt-3 text-xs text-slate-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        onClick={() => removeProject(p.id)}
                      >
                        Eliminar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
