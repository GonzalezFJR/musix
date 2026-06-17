"""Catálogo de instrumentos disponibles para el render (SFZ + disponibilidad SF2).

Reservado a cuentas con acceso a render (Pro/admin), igual que el export a MP3:
la selección de instrumentos solo tiene sentido para quien puede renderizar audio."""

from fastapi import APIRouter

from ..catalog import DEFAULT_SOUNDFONT, public_sfz_catalog, soundfont_path
from ..deps import RenderUser

router = APIRouter(prefix="/api/instruments", tags=["instruments"])


@router.get("")
def list_instruments(user: RenderUser) -> dict:
    return {
        "sf2_available": soundfont_path().is_file(),
        "default_soundfont": DEFAULT_SOUNDFONT,
        "sfz": public_sfz_catalog(),
    }
