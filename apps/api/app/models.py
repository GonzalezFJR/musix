"""Modelos de dominio (Pydantic).

Antes eran tablas SQLModel; con la migración a DynamoDB single-table son modelos
Pydantic puros. Se mantienen los nombres de campo y `.model_dump()` para que los
routers y schemas no cambien de forma. Los IDs son ULID string (ver `app/ids.py`).
La (de)serialización item↔modelo de DynamoDB vive en `app/db/dynamo.py`.
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from .ids import new_id


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Roles de usuario.
#   admin   — acceso total: panel de admin + uso normal de la app.
#   free    — cuenta gratuita (por defecto).
#   pro     — cuenta de pago (render de audio).
#   invited — invitado / colaborador con acceso limitado.
ROLES = ("admin", "free", "pro", "invited")
DEFAULT_ROLE = "free"

# Modos de tema visual.
THEMES = ("light", "normal", "dark")
DEFAULT_THEME = "normal"


class User(BaseModel):
    id: str = Field(default_factory=new_id)
    email: str
    hashed_password: str = ""
    display_name: str = ""
    role: str = DEFAULT_ROLE

    # Perfil (opcional).
    author_name: str = ""
    first_name: str = ""
    last_name: str = ""
    location: str = ""

    # Preferencias.
    theme: str = DEFAULT_THEME
    preferences: dict = Field(default_factory=dict)

    # Enlace de cuenta con Google (OpenID `sub`), si se registró/entró por Google.
    google_sub: Optional[str] = None

    # Nº de proyectos (contador denormalizado, mantenido al crear/borrar proyectos).
    project_count: int = 0

    created_at: datetime = Field(default_factory=utcnow)


class Folder(BaseModel):
    """Directorio del dashboard. `parent_id` apunta a otra carpeta (subdirectorios)."""

    id: str = Field(default_factory=new_id)
    owner_id: str
    name: str
    parent_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class Project(BaseModel):
    """Proyecto *ligero*. Lo "gordo" (el score) vive como `.mu6` en el
    almacenamiento de ficheros (S3 + caché local), no aquí."""

    id: str = Field(default_factory=new_id)
    owner_id: str
    folder_id: Optional[str] = None
    title: str
    artist: str = ""
    description: str = ""
    has_score: bool = False
    original_filename: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class LoginEvent(BaseModel):
    """Evento de inicio de sesión (para estadísticas de admin)."""

    id: str = Field(default_factory=new_id)
    user_id: str
    email: str = ""
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class PasswordResetToken(BaseModel):
    """Token de recuperación de contraseña. Caduca por TTL nativo de DynamoDB."""

    token: str
    user_id: str
    email: str
    expires_at: datetime


class ContactMessage(BaseModel):
    """Mensaje del formulario público de contacto."""

    id: str = Field(default_factory=new_id)
    name: str
    email: str
    subject: str = ""
    body: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class AudioJob(BaseModel):
    """Trabajo del Audio Lab: análisis / separación / transcripción de audio.

    Es asíncrono: se crea en estado `queued`, un worker lo toma (`running`) y al
    terminar queda en `done` o `error`. El audio de entrada y los artefactos de
    salida viven en el almacenamiento (no en la BD); aquí solo van referencias.
    """

    id: str = Field(default_factory=new_id)
    owner_id: str
    # analysis | separation | transcription
    kind: str
    # id del engine seleccionado (p. ej. "probe", "librosa", "demucs", "basic-pitch").
    engine: str
    # queued | running | done | error
    status: str = "queued"
    # upload | youtube
    source_kind: str = "upload"
    # clave de storage del input (upload) o URL (youtube, hasta que se descarga).
    source_ref: str = ""
    input_filename: str = ""
    params: dict = Field(default_factory=dict)
    # Artefactos: [{name, key, kind, meta}]. `key` es la clave en storage.
    outputs: list[dict] = Field(default_factory=list)
    # Resumen estructurado del resultado (p. ej. tempo/tonalidad para análisis).
    result: dict = Field(default_factory=dict)
    error: str = ""
    logs: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class GlobalStats(BaseModel):
    """Contadores agregados para el panel de admin."""

    user_count: int = 0
    project_count: int = 0
    users_admin: int = 0
    users_free: int = 0
    users_pro: int = 0
    users_invited: int = 0
