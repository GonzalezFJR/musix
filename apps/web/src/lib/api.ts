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

function jsonBody(method: string, data: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

// ── Tipos ──────────────────────────────────────────────────────
export type Theme = "light" | "normal" | "dark";
export type Role = "admin" | "free" | "pro" | "invited";

export interface User {
  id: string;
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
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}
export interface ProjectSummary {
  id: string;
  title: string;
  artist: string;
  description: string;
  folder_id: string | null;
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
export interface PublicConfig {
  turnstile_site_key: string;
  google_enabled: boolean;
  registration_enabled: boolean;
  // Modo local sin login: entrar directo como admin, ocultar pantallas de auth.
  auth_disabled: boolean;
}

// ── Admin ──────────────────────────────────────────────────────
export interface AdminUserSummary {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  project_count: number;
  last_login: string | null;
  created_at: string;
}
export interface AdminUserDetail extends AdminUserSummary {
  author_name: string;
  first_name: string;
  last_name: string;
  location: string;
  projects: ProjectSummary[];
}
export interface AdminUserList {
  users: AdminUserSummary[];
  next_cursor: string | null;
}
export interface LoginEventRead {
  user_id: string;
  email: string;
  created_at: string;
}
export interface AdminStats {
  user_count: number;
  project_count: number;
  users_admin: number;
  users_free: number;
  users_pro: number;
  users_invited: number;
  recent_logins: LoginEventRead[];
}
export interface ContactMessageRead {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  created_at: string;
}
export interface AdminContactList {
  messages: ContactMessageRead[];
  next_cursor: string | null;
}

// ── Audio Lab ──────────────────────────────────────────────────
export type AudioKind = "analysis" | "separation" | "transcription";
export type AudioJobStatus = "queued" | "running" | "done" | "error";
export interface AudioEngine {
  id: string;
  kind: AudioKind;
  label: string;
  needs_gpu: boolean;
  available: boolean;
  params_schema: Record<string, unknown>;
}
export interface AudioOutput {
  name: string;
  kind: string;
  meta: Record<string, unknown>;
}
export interface AudioJob {
  id: string;
  kind: AudioKind;
  engine: string;
  status: AudioJobStatus;
  source_kind: "upload" | "youtube";
  input_filename: string;
  params: Record<string, unknown>;
  outputs: AudioOutput[];
  result: Record<string, unknown>;
  error: string;
  created_at: string;
  updated_at: string;
}

// URL para iniciar el login con Google (redirige el navegador completo).
export const googleLoginUrl = "/api/auth/google/login";

export const api = {
  // ── Config pública ───────────────────────────────────────────
  publicConfig() {
    return request<PublicConfig>("/public-config");
  },

  // ── Auth ─────────────────────────────────────────────────────
  async register(
    email: string,
    password: string,
    captchaToken: string,
    profile: Omit<ProfileUpdate, "theme" | "preferences"> = {},
  ) {
    return request<User>(
      "/auth/register",
      jsonBody("POST", { email, password, captcha_token: captchaToken, ...profile }),
    );
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
    return request<User>("/auth/me", jsonBody("PATCH", data));
  },

  forgotPassword(email: string, captchaToken: string) {
    return request<{ ok: boolean }>(
      "/auth/forgot-password",
      jsonBody("POST", { email, captcha_token: captchaToken }),
    );
  },
  resetPassword(token: string, password: string, captchaToken: string) {
    return request<{ ok: boolean }>(
      "/auth/reset-password",
      jsonBody("POST", { token, password, captcha_token: captchaToken }),
    );
  },

  // ── Contacto ─────────────────────────────────────────────────
  contact(data: { name: string; email: string; subject: string; message: string; captchaToken: string }) {
    return request<{ ok: boolean }>(
      "/contact",
      jsonBody("POST", {
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
        captcha_token: data.captchaToken,
      }),
    );
  },

  // ── Carpetas ─────────────────────────────────────────────────
  listFolders() {
    return request<Folder[]>("/folders");
  },
  createFolder(name: string, parentId: string | null = null) {
    return request<Folder>("/folders", jsonBody("POST", { name, parent_id: parentId }));
  },
  updateFolder(id: string, data: { name?: string; parent_id?: string | null }) {
    return request<Folder>(`/folders/${id}`, jsonBody("PATCH", data));
  },
  deleteFolder(id: string) {
    return request<void>(`/folders/${id}`, { method: "DELETE" });
  },

  // ── Proyectos ────────────────────────────────────────────────
  listProjects() {
    return request<ProjectSummary[]>("/projects");
  },
  createProject(title: string, artist = "", folderId: string | null = null) {
    return request<Project>("/projects", jsonBody("POST", { title, artist, folder_id: folderId }));
  },
  getProject(id: string) {
    return request<Project>(`/projects/${id}`);
  },
  updateProject(
    id: string,
    data: {
      title?: string;
      artist?: string;
      description?: string;
      folder_id?: string | null;
      move_to_root?: boolean;
      score?: Record<string, unknown>;
    },
  ) {
    return request<Project>(`/projects/${id}`, jsonBody("PATCH", data));
  },
  // Mueve un proyecto a una carpeta (o a la raíz con folderId = null).
  moveProject(id: string, folderId: string | null) {
    return this.updateProject(
      id,
      folderId === null ? { move_to_root: true } : { folder_id: folderId },
    );
  },
  deleteProject(id: string) {
    return request<void>(`/projects/${id}`, { method: "DELETE" });
  },
  async uploadFile(id: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<Project>(`/projects/${id}/file`, { method: "POST", body: form });
  },
  // ── Instrumentos (catálogo de render) ────────────────────────
  listInstruments() {
    return request<InstrumentCatalog>("/instruments");
  },
  // Descarga el fichero original como ArrayBuffer (con auth) para AlphaTab.
  async fetchFileBytes(id: string): Promise<ArrayBuffer> {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`/api/projects/${id}/file`, { headers });
    if (!res.ok) throw new ApiError(res.status, "No se pudo descargar el fichero");
    return res.arrayBuffer();
  },

  // ── Admin ────────────────────────────────────────────────────
  adminStats() {
    return request<AdminStats>("/admin/stats");
  },
  adminUsers(cursor: string | null = null, limit = 50) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    return request<AdminUserList>(`/admin/users?${q}`);
  },
  adminUser(id: string) {
    return request<AdminUserDetail>(`/admin/users/${id}`);
  },
  adminUpdateUser(id: string, data: { role?: Role; display_name?: string }) {
    return request<AdminUserDetail>(`/admin/users/${id}`, jsonBody("PATCH", data));
  },
  adminDeleteUser(id: string) {
    return request<void>(`/admin/users/${id}`, { method: "DELETE" });
  },
  adminContacts(cursor: string | null = null, limit = 50) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    return request<AdminContactList>(`/admin/contacts?${q}`);
  },

  // ── Audio Lab ────────────────────────────────────────────────
  audioEngines() {
    return request<AudioEngine[]>("/audio/engines");
  },
  listAudioJobs() {
    return request<{ jobs: AudioJob[]; next_cursor: string | null }>("/audio/jobs");
  },
  getAudioJob(id: string) {
    return request<AudioJob>(`/audio/jobs/${id}`);
  },
  async createAudioJob(input: {
    kind: AudioKind;
    engine: string;
    params?: Record<string, unknown>;
    file?: File | null;
    youtubeUrl?: string;
  }) {
    const form = new FormData();
    form.append("kind", input.kind);
    form.append("engine", input.engine);
    form.append("params", JSON.stringify(input.params ?? {}));
    if (input.file) form.append("file", input.file);
    if (input.youtubeUrl) form.append("youtube_url", input.youtubeUrl);
    return request<AudioJob>("/audio/jobs", { method: "POST", body: form });
  },
  runAudioJob(id: string) {
    return request<AudioJob>(`/audio/jobs/${id}/run`, { method: "POST" });
  },
  deleteAudioJob(id: string) {
    return request<void>(`/audio/jobs/${id}`, { method: "DELETE" });
  },
  // URL de descarga de un artefacto (incluye el token como query no es posible aquí;
  // los artefactos se sirven con auth Bearer vía fetch en el componente).
  audioOutputPath(id: string, name: string) {
    return `/api/audio/jobs/${id}/outputs/${encodeURIComponent(name)}`;
  },
};
