"""Factory de almacenamiento según `settings.storage_backend`."""

from __future__ import annotations

from functools import lru_cache

from ..config import get_settings
from .base import StorageBackend, original_key, project_prefix, score_key

__all__ = [
    "StorageBackend",
    "get_storage",
    "project_prefix",
    "score_key",
    "original_key",
]


@lru_cache
def get_storage() -> StorageBackend:
    settings = get_settings()
    if settings.storage_backend == "s3":
        from .s3 import S3Storage

        return S3Storage(
            bucket=settings.s3_bucket or "",
            region=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            prefix=settings.s3_prefix,
            access_key_id=settings.aws_access_key_id,
            secret_access_key=settings.aws_secret_access_key,
        )
    # Default: disco local.
    from .local import LocalStorage

    return LocalStorage(settings.files_dir)
