from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


# ── Usuarios ─────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str = ""
    # Perfil opcional al registrarse.
    author_name: str = ""
    first_name: str = ""
    last_name: str = ""
    location: str = ""
    # Token de Cloudflare Turnstile.
    captcha_token: str = ""


class UserRead(BaseModel):
    id: str
    email: EmailStr
    role: str
    display_name: str
    author_name: str = ""
    first_name: str = ""
    last_name: str = ""
    location: str = ""
    theme: str = "normal"
    preferences: dict = {}


class UserProfileUpdate(BaseModel):
    """Actualización de perfil y preferencias del usuario (PATCH /auth/me)."""

    display_name: Optional[str] = None
    author_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    location: Optional[str] = None
    theme: Optional[str] = None
    preferences: Optional[dict] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Recuperación de contraseña ───────────────────────────────────
class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    captcha_token: str = ""


class ResetPasswordRequest(BaseModel):
    token: str
    password: str
    captcha_token: str = ""


# ── Contacto ─────────────────────────────────────────────────────
class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    subject: str = ""
    message: str
    captcha_token: str = ""


# ── Config pública (claves no secretas para el frontend) ─────────
class PublicConfig(BaseModel):
    turnstile_site_key: str
    google_enabled: bool
    registration_enabled: bool


# ── Carpetas ─────────────────────────────────────────────────────
class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None


class FolderRead(BaseModel):
    id: str
    name: str
    parent_id: Optional[str]
    created_at: datetime


# ── Proyectos ────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    title: str
    artist: str = ""
    description: str = ""
    folder_id: Optional[str] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    description: Optional[str] = None
    folder_id: Optional[str] = None
    # Sentinela para distinguir "no tocar folder" de "mover a raíz (null)".
    move_to_root: bool = False
    score: Optional[dict] = None


class ProjectSummary(BaseModel):
    id: str
    title: str
    artist: str
    description: str = ""
    folder_id: Optional[str]
    has_score: bool = False
    original_filename: Optional[str]
    created_at: datetime
    updated_at: datetime


class ProjectRead(ProjectSummary):
    score: dict


# ── Admin ────────────────────────────────────────────────────────
class AdminUserSummary(BaseModel):
    id: str
    email: EmailStr
    display_name: str
    role: str
    project_count: int = 0
    last_login: Optional[datetime] = None
    created_at: datetime


class AdminUserList(BaseModel):
    users: list[AdminUserSummary]
    # Cursor opaco para la siguiente página (None si no hay más).
    next_cursor: Optional[str] = None


class AdminUserDetail(AdminUserSummary):
    author_name: str = ""
    first_name: str = ""
    last_name: str = ""
    location: str = ""
    projects: list[ProjectSummary] = []


class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    display_name: Optional[str] = None


class LoginEventRead(BaseModel):
    user_id: str
    email: str = ""
    created_at: datetime


class AdminStats(BaseModel):
    user_count: int
    project_count: int
    users_admin: int
    users_free: int
    users_pro: int
    users_invited: int
    recent_logins: list[LoginEventRead] = []


class ContactMessageRead(BaseModel):
    id: str
    name: str
    email: EmailStr
    subject: str = ""
    body: str = ""
    created_at: datetime


class AdminContactList(BaseModel):
    messages: list[ContactMessageRead]
    next_cursor: Optional[str] = None
