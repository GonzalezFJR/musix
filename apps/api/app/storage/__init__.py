"""Factory de almacenamiento.

Con S3 configurado (`S3_BUCKET_NAME`): S3 canónico + caché local (TTL de días).
Sin S3 (desarrollo sin AWS): solo disco local (persistente).
"""

from __future__ import annotations

from functools import lru_cache

from ..config import get_settings
from .base import (
    StorageBackend,
    audio_input_key,
    audio_output_key,
    audio_prefix,
    original_key,
    project_prefix,
    score_key,
)

__all__ = [
    "StorageBackend",
    "get_storage",
    "project_prefix",
    "score_key",
    "original_key",
    "audio_prefix",
    "audio_input_key",
    "audio_output_key",
]


@lru_cache
def get_storage() -> StorageBackend:
    settings = get_settings()
    from .local import LocalStorage

    cache = LocalStorage(settings.files_dir)
    if settings.s3_enabled:
        from .caching import CachingStorage
        from .s3 import S3Storage

        s3 = S3Storage(
            bucket=settings.s3_bucket_name or "",
            region=settings.aws_region,
            access_key_id=settings.aws_access_key,
            secret_access_key=settings.aws_secret_key,
        )
        return CachingStorage(s3, cache, ttl_days=settings.cache_ttl_days)
    # Dev sin S3: disco local persistente.
    return cache
