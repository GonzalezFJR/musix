from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Roles de usuario. De momento casi placeholders: declarados para preparar el
# gating de funcionalidades en producción.
#   admin   — acceso total + vista /docs.
#   free    — cuenta gratuita (por defecto).
#   pro     — cuenta de pago.
#   invited — invitado / colaborador con acceso limitado.
ROLES = ("admin", "free", "pro", "invited")
DEFAULT_ROLE = "free"

# Modos de tema visual.
THEMES = ("light", "normal", "dark")
DEFAULT_THEME = "normal"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    display_name: str = ""
    role: str = Field(default=DEFAULT_ROLE, index=True)

    # Perfil (opcional).
    author_name: str = ""
    first_name: str = ""
    last_name: str = ""
    location: str = ""

    # Preferencias.
    theme: str = DEFAULT_THEME
    # Bolsa de preferencias adicionales (extensible sin migraciones).
    preferences: dict = Field(default_factory=dict, sa_column=Column(JSON))

    created_at: datetime = Field(default_factory=utcnow)


class Folder(SQLModel, table=True):
    """Directorio del dashboard. `parent_id` apunta a otra carpeta (subdirectorios)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(index=True, foreign_key="user.id")
    name: str
    parent_id: Optional[int] = Field(default=None, index=True, foreign_key="folder.id")
    created_at: datetime = Field(default_factory=utcnow)


class Project(SQLModel, table=True):
    """Tabla *ligera* de proyecto. Lo "gordo" (el score) vive como `.mu6` en el
    almacenamiento de ficheros, no aquí."""

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(index=True, foreign_key="user.id")
    # Carpeta contenedora (None = raíz del dashboard).
    folder_id: Optional[int] = Field(default=None, index=True, foreign_key="folder.id")
    title: str
    artist: str = ""
    description: str = ""
    # Indica si existe un score.mu6 guardado en el almacenamiento.
    has_score: bool = False
    # Nombre del fichero original importado (si lo hay), guardado en el almacenamiento.
    original_filename: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
