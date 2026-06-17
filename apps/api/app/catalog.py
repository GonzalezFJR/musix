"""Catálogo de instrumentos para el render de audio.

- SF2: el SoundFont base (MuseScore General) cubre los 128 programas General MIDI;
  el frontend ya conoce esa lista, aquí solo indicamos disponibilidad.
- SFZ: sintetizadores integrados (osciladores, CC0, siempre presentes) + cualquier
  librería SFZ que el usuario haya descargado en soundbanks/sfz/<lib>/.
"""

import json
from pathlib import Path

from .config import get_settings

settings = get_settings()
BUILTIN_SFZ_DIR = Path(__file__).parent / "sfz"
DEFAULT_SOUNDFONT = "MuseScore_General.sf3"

# Sintetizadores integrados (sin descarga). Autoría propia → CC0.
_BUILTIN = [
    ("builtin-sine", "Sintetizador (senoidal)", "sine.sfz"),
    ("builtin-triangle", "Sintetizador (triangular)", "triangle.sfz"),
    ("builtin-saw", "Sintetizador (sierra)", "saw.sfz"),
    ("builtin-square", "Sintetizador (cuadrada)", "square.sfz"),
]


def _builtin_items() -> list[dict]:
    items = []
    for id_, name, fn in _BUILTIN:
        p = BUILTIN_SFZ_DIR / fn
        if p.is_file():
            items.append({
                "id": id_,
                "name": name,
                "family": "Sintetizador",
                "engine": "sfz",
                "license": "CC0-1.0",
                "attribution": "Sintetizadores Musix (CC0)",
                "_path": str(p),
            })
    return items


def _manifest_attribution() -> dict[str, tuple[str, str, str]]:
    """basename(dest_dir) → (licencia, atribución, nombre legible) leído del manifest."""
    out: dict[str, tuple[str, str, str]] = {}
    try:
        data = json.loads((settings.soundbanks_dir / "manifest.json").read_text())
        for sb in data.get("soundbanks", []):
            dd = sb.get("dest_dir") or ""
            base = dd.split("/")[-1] if dd else sb.get("id")
            if base:
                out[base] = (sb.get("license", ""), sb.get("attribution", ""), sb.get("name", base))
    except Exception:
        pass
    return out


def _soundbank_sfz_items(limit_per_lib: int = 60) -> list[dict]:
    """Escanea las librerías SFZ descargadas a mano en soundbanks/sfz/<lib>/."""
    base = settings.soundbanks_dir / "sfz"
    if not base.is_dir():
        return []
    attribution = _manifest_attribution()
    items: list[dict] = []
    for lib in sorted(p for p in base.iterdir() if p.is_dir()):
        if lib.name == "builtin":
            continue
        lic, attr, fam = attribution.get(lib.name, ("", lib.name, lib.name))
        count = 0
        for sfz in sorted(lib.rglob("*.sfz")):
            rel = sfz.relative_to(base)
            items.append({
                "id": f"sfz:{rel.as_posix()}",
                "name": sfz.stem.replace("_", " "),
                "family": fam,
                "engine": "sfz",
                "license": lic,
                "attribution": attr or lib.name,
                "_path": str(sfz),
            })
            count += 1
            if count >= limit_per_lib:
                break
    return items


def sfz_catalog() -> list[dict]:
    return _builtin_items() + _soundbank_sfz_items()


def public_sfz_catalog() -> list[dict]:
    return [{k: v for k, v in it.items() if not k.startswith("_")} for it in sfz_catalog()]


def resolve_sfz_path(instrument_id: str) -> str | None:
    for it in sfz_catalog():
        if it["id"] == instrument_id:
            return it["_path"]
    return None


def attribution_for(instrument_id: str) -> str | None:
    for it in sfz_catalog():
        if it["id"] == instrument_id and it.get("license", "").upper() not in ("", "CC0-1.0"):
            return it.get("attribution")
    return None


def soundfont_path(name: str = DEFAULT_SOUNDFONT) -> Path:
    base = (settings.soundbanks_dir / "sf2").resolve()
    target = (base / name).resolve()
    if base not in target.parents or not target.is_file():
        return base / DEFAULT_SOUNDFONT  # el render valida existencia y responde 503
    return target
