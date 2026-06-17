"""Sincronización de soundbanks desde S3 (fuente de verdad) a la copia local.

El render de audio (FluidSynth/sfizz) lee siempre del disco local
(`SOUNDBANKS_DIR`). En producción, los soundbanks viven en S3 bajo
`SOUNDBANKS_S3_PREFIX`; al arrancar se descargan los que falten (idempotente:
el primer arranque es lento por el tamaño, los siguientes son instantáneos).

La subida inicial de la copia local a S3 se hace con
`scripts/push-soundbanks-s3.sh`.
"""

from __future__ import annotations

import logging
from pathlib import Path

from .config import get_settings

logger = logging.getLogger(__name__)


def sync_soundbanks_from_s3() -> int:
    """Descarga de S3 los soundbanks que falten en local. Devuelve nº descargados."""
    settings = get_settings()
    if not settings.s3_enabled:
        return 0  # dev sin S3: se usa lo que haya en disco

    import boto3

    client = boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key or None,
        aws_secret_access_key=settings.aws_secret_key or None,
    )
    bucket = settings.s3_bucket_name
    prefix = settings.soundbanks_s3_prefix.strip("/")
    root = Path(settings.soundbanks_dir)
    root.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=f"{prefix}/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            rel = key[len(prefix) + 1 :] if prefix else key
            if not rel:
                continue
            dest = root / rel
            # Descargar solo si falta o difiere el tamaño (heurística barata).
            if dest.exists() and dest.stat().st_size == obj.get("Size", -1):
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            client.download_file(bucket, key, str(dest))
            downloaded += 1
    if downloaded:
        logger.info("Soundbanks sincronizados desde S3: %d ficheros nuevos/actualizados", downloaded)
    return downloaded
