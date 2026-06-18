import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import admin, auth, contact, folders, instruments, projects, render, score
from .schemas import PublicConfig
from .storage import get_storage
from .storage.caching import CachingStorage

logger = logging.getLogger(__name__)
settings = get_settings()


async def _cache_sweeper() -> None:
    """Barre periódicamente la caché local borrando ficheros más antiguos que el TTL."""
    storage = get_storage()
    if not isinstance(storage, CachingStorage):
        return
    while True:
        await asyncio.sleep(6 * 3600)  # cada 6 horas
        try:
            removed = await asyncio.to_thread(storage.sweep_expired)
            if removed:
                logger.info("Caché: %d ficheros caducados eliminados", removed)
        except Exception:  # noqa: BLE001
            logger.exception("Fallo barriendo la caché")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Sincroniza soundbanks desde S3 (si está configurado) sin bloquear el arranque.
    try:
        from .soundbanks_sync import sync_soundbanks_from_s3

        await asyncio.to_thread(sync_soundbanks_from_s3)
    except Exception:  # noqa: BLE001
        logger.exception("Fallo sincronizando soundbanks desde S3")
    sweeper = asyncio.create_task(_cache_sweeper())
    try:
        yield
    finally:
        sweeper.cancel()


app = FastAPI(title="Musix API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(contact.router)
app.include_router(folders.router)
app.include_router(projects.router)
app.include_router(score.router)
app.include_router(render.router)
app.include_router(instruments.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/public-config", response_model=PublicConfig, tags=["meta"])
def public_config() -> PublicConfig:
    """Config no secreta para el frontend (clave pública de captcha, etc.)."""
    return PublicConfig(
        turnstile_site_key=settings.captcha_site_key,
        google_enabled=settings.google_enabled,
        registration_enabled=settings.allow_registration,
        auth_disabled=settings.auth_disabled,
    )
