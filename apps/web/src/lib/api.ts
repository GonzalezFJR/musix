// Cliente HTTP minimalista para la API de Musix.
// El token JWT se guarda en localStorage y se adjunta a cada petición.

const TOKEN_KEY = "musix_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Tipos ──────────────────────────────────────────────────────
export type Theme = "light" | "normal" | "dark";
export type Role = "admin" | "free" | "pro" | "invited";

export interface User {
  id: number;
  email: string;
  role: Role;
  display_name: string;
  author_name: string;
  first_name: string;
  last_name: string;
  location: string;
  theme: Theme;
  preferences: Record<string, unknown>;
}
export interface ProfileUpdate {
  display_name?: string;
  author_name?: string;
  first_name?: string;
  last_name?: string;
  location?: string;
  theme?: Theme;
  preferences?: Record<string, unknown>;
}
export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
}
export interface ProjectSummary {
  id: number;
  title: string;
  artist: string;
  description: string;
  folder_id: number | null;
  has_score: boolean;
  original_filename: string | null;
  created_at: string;
  updated_at: string;
}
export interface Project extends ProjectSummary {
  score: Record<string, unknown>;
}
export interface SfzInstrument {
  id: string;
  name: string;
  family: string;
  engine: "sfz";
  license: string;
  attribution: string;
}
export interface InstrumentCatalog {
  sf2_available: boolean;
  default_soundfont: string;
  sfz: SfzInstrument[];
}

// ── Auth ───────────────────────────────────────────────────────
export const api = {
  async register(
    email: string,
    password: string,
    profile: Omit<ProfileUpdate, "theme" | "preferences"> = {},
  ) {
    return request<User>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, ...profile }),
    });
  },

  async login(email: string, password: string) {
    // OAuth2 password flow espera form-urlencoded con "username".
    const form = new URLSearchParams({ username: email, password });
    const data = await request<{ access_token: string }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    setToken(data.access_token);
    return data;
  },

  logout() {
    setToken(null);
  },

  me() {
    return request<User>("/auth/me");
  },
  updateProfile(data: ProfileUpdate) {
    return request<User>("/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // ── Carpetas ─────────────────────────────────────────────────
  listFolders() {
    return request<Folder[]>("/folders");
  },
  createFolder(name: string, parentId: number | null = null) {
    return request<Folder>("/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_id: parentId }),
    });
  },
  updateFolder(id: number, data: { name?: string; parent_id?: number | null }) {
    return request<Folder>(`/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  deleteFolder(id: number) {
    return request<void>(`/folders/${id}`, { method: "DELETE" });
  },

  // ── Proyectos ────────────────────────────────────────────────
  listProjects() {
    return request<ProjectSummary[]>("/projects");
  },
  createProject(title: string, artist = "", folderId: number | null = null) {
    return request<Project>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, artist, folder_id: folderId }),
    });
  },
  getProject(id: number) {
    return request<Project>(`/projects/${id}`);
  },
  updateProject(
    id: number,
    data: {
      title?: string;
      artist?: string;
      description?: string;
      folder_id?: number | null;
      move_to_root?: boolean;
      score?: Record<string, unknown>;
    },
  ) {
    return request<Project>(`/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  // Mueve un proyecto a una carpeta (o a la raíz con folderId = null).
  moveProject(id: number, folderId: number | null) {
    return this.updateProject(
      id,
      folderId === null ? { move_to_root: true } : { folder_id: folderId },
    );
  },
  deleteProject(id: number) {
    return request<void>(`/projects/${id}`, { method: "DELETE" });
  },
  async uploadFile(id: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<Project>(`/projects/${id}/file`, { method: "POST", body: form });
  },
  // ── Instrumentos (catálogo de render) ────────────────────────
  listInstruments() {
    return request<InstrumentCatalog>("/instruments");
  },
  // Descarga el fichero original como ArrayBuffer (con auth) para AlphaTab.
  async fetchFileBytes(id: number): Promise<ArrayBuffer> {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`/api/projects/${id}/file`, { headers });
    if (!res.ok) throw new ApiError(res.status, "No se pudo descargar el fichero");
    return res.arrayBuffer();
  },
};
