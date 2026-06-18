from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# Claves de TEST de Cloudflare Turnstile (siempre pasan). Útiles en desarrollo:
# así el flujo con captcha funciona sin claves reales. En producción se
# sobreescriben vía .env con las claves del sitio.
TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA"
TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA"


class Settings(BaseSettings):
    # pydantic-settings mapea cada campo a su env var homónima en mayúsculas
    # (case-insensitive): p. ej. `aws_region` ← `AWS_REGION`.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # ── Seguridad / JWT ───────────────────────────────────────────
    secret_key: str = "dev-insecure-secret-change-me-please-32b+"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 días

    # ── Cuenta de administrador inicial ───────────────────────────
    # ADMIN_USERNAME se usa como email de login del admin sembrado al arrancar.
    admin_username: Optional[str] = None
    admin_password: Optional[str] = None

    # ── Registro / flujo público ──────────────────────────────────
    allow_registration: bool = True
    # URL pública del frontend (para enlaces de email y redirect de OAuth).
    public_base_url: str = "http://localhost:5173"
    # Orígenes permitidos por CORS (coma-separados).
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ── Backend de metadatos ──────────────────────────────────────
    # "dynamodb" (producción / AWS) | "sqlite" (desarrollo local, un fichero).
    db_backend: str = "dynamodb"
    # Ruta del fichero SQLite cuando db_backend == "sqlite".
    sqlite_path: Path = Path("/data/musix.db")

    # ── Sidecar score-engine (Node + AlphaTab, fuente de verdad de .mu6) ─
    score_engine_dir: Path = Path("/score-engine")
    node_bin: str = "node"

    # ── Modo local sin autenticación ──────────────────────────────
    # Si está activo, se omite el login y toda petición entra como el usuario
    # admin sembrado (desarrollo local). NO usar en producción.
    auth_disabled: bool = False

    # ── DynamoDB (backend de metadatos en producción, single-table) ─
    aws_region: str = "eu-west-1"
    aws_access_key: Optional[str] = None
    aws_secret_key: Optional[str] = None
    dynamodb_table: str = "musix"
    # Si está definido → DynamoDB Local (dev). En AWS real se deja vacío.
    dynamodb_endpoint_url: Optional[str] = None

    # ── Almacenamiento de ficheros: S3 canónico + caché local ─────
    s3_bucket_name: Optional[str] = None
    # Raíz de la caché local (efímera, TTL de días). Si no hay S3, actúa como
    # almacenamiento local persistente (desarrollo sin AWS).
    files_dir: Path = Path("/data/files")
    cache_ttl_days: int = 7

    # ── Soundbanks (SF2/SF3 + SFZ). S3 fuente de verdad; copia local. ──
    soundbanks_dir: Path = Path("/soundbanks")
    soundbanks_s3_prefix: str = "soundbanks"

    # ── SMTP / email (contacto + recuperación de contraseña) ──────
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: str = "contacto@mu6.es"
    smtp_from_name: str = "Musix"
    smtp_starttls: bool = True
    smtp_ssl: bool = False
    mail_to: Optional[str] = None

    # ── Captcha (Cloudflare Turnstile) ────────────────────────────
    captcha_site_key: str = TURNSTILE_TEST_SITE_KEY
    captcha_secret_key: str = TURNSTILE_TEST_SECRET_KEY

    # ── Google OAuth2 ─────────────────────────────────────────────
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def s3_enabled(self) -> bool:
        return bool(self.s3_bucket_name)


@lru_cache
def get_settings() -> Settings:
    return Settings()
