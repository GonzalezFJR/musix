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


class UserRead(BaseModel):
    id: int
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


# ── Carpetas ─────────────────────────────────────────────────────
class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None


class FolderRead(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    created_at: datetime


# ── Proyectos ────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    title: str
    artist: str = ""
    description: str = ""
    folder_id: Optional[int] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    description: Optional[str] = None
    folder_id: Optional[int] = None
    # Sentinela para distinguir "no tocar folder" de "mover a raíz (null)".
    move_to_root: bool = False
    score: Optional[dict] = None


class ProjectSummary(BaseModel):
    id: int
    title: str
    artist: str
    description: str = ""
    folder_id: Optional[int]
    has_score: bool = False
    original_filename: Optional[str]
    created_at: datetime
    updated_at: datetime


class ProjectRead(ProjectSummary):
    score: dict
