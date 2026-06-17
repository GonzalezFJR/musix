from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Base de datos. Por defecto SQLite para desarrollo local sin Postgres.
    database_url: str = "sqlite:///./musix.db"
    # Backend de persistencia de metadatos: "sql" (SQLModel) o "dynamodb".
    # En dev/local usamos "sql". El adaptador DynamoDB está declarado pero es un
    # stub (preparación para producción) — ver app/db/dynamo.py.
    db_backend: str = "sql"
    # DynamoDB (solo se usan si db_backend == "dynamodb").
    dynamodb_region: str = "eu-west-1"
    dynamodb_endpoint_url: Optional[str] = None  # p. ej. http://localhost:8001 (local)
    dynamodb_table_prefix: str = "musix_"

    # Seguridad
    secret_key: str = "dev-insecure-secret-change-me-please-32b+"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 días

    # Comportamiento
    allow_registration: bool = True
    # Desactiva la autenticación durante el desarrollo: todas las peticiones se
    # tratan como un usuario "dev" fijo (con rol admin). Poner en false antes de producción.
    auth_disabled: bool = True
    # Muestra la landing page pública (registro/login). En dev queda desactivada;
    # se activa en producción.
    landing_enabled: bool = False

    # Cuenta de administrador inicial. Si ambos están definidos, al arrancar se
    # crea/asegura un usuario con rol "admin".
    admin_email: Optional[str] = None
    admin_password: Optional[str] = None

    # ── Almacenamiento de ficheros (.mu6, originales gp5, etc.) ────────────
    # "local" (disco, default dev) o "s3" (S3 / S3-compatible vía boto3).
    storage_backend: str = "local"
    # Almacenamiento local: carpeta raíz.
    files_dir: Path = Path("/data/files")
    # Almacenamiento S3 (solo se usan si storage_backend == "s3").
    s3_bucket: Optional[str] = None
    s3_region: str = "eu-west-1"
    s3_endpoint_url: Optional[str] = None  # S3-compatible (MinIO, etc.)
    s3_prefix: str = ""
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None

    # Bancos de sonido (SF2/SF3 + SFZ) para el render de audio. Carpeta montada
    # de solo lectura; se puebla a mano con scripts/fetch-soundbanks.sh.
    soundbanks_dir: Path = Path("/soundbanks")


@lru_cache
def get_settings() -> Settings:
    return Settings()
