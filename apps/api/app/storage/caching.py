"""Almacenamiento con caché local sobre un backend canónico (S3).

- S3 es la fuente de verdad de los ficheros de proyecto.
- El disco local actúa como caché de lectura/escritura con TTL de días: acelera
  lecturas repetidas sin golpear S3 cada vez. Un barrido periódico
  (`sweep_expired`) elimina los ficheros más antiguos que el TTL.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from .base import StorageBackend
from .local import LocalStorage

logger = logging.getLogger(__name__)


class CachingStorage(StorageBackend):
    def __init__(self, canonical: StorageBackend, cache: LocalStorage, ttl_days: int = 7):
        self.canonical = canonical
        self.cache = cache
        self.ttl_seconds = ttl_days * 86400

    def _fresh(self, key: str) -> bool:
        try:
            path = self.cache._path(key)
        except ValueError:
            return False
        if not path.exists():
            return False
        return (time.time() - path.stat().st_mtime) < self.ttl_seconds

    def put(self, key: str, data: bytes) -> None:
        self.canonical.put(key, data)  # canónico primero
        try:
            self.cache.put(key, data)
        except Exception:  # noqa: BLE001 — la caché es best-effort
            logger.warning("No se pudo escribir en caché local: %s", key)

    def get(self, key: str) -> bytes:
        if self._fresh(key):
            try:
                return self.cache.get(key)
            except FileNotFoundError:
                pass
        data = self.canonical.get(key)  # propaga FileNotFoundError
        try:
            self.cache.put(key, data)
        except Exception:  # noqa: BLE001
            pass
        return data

    def delete(self, key: str) -> None:
        self.canonical.delete(key)
        self.cache.delete(key)

    def delete_prefix(self, prefix: str) -> None:
        self.canonical.delete_prefix(prefix)
        self.cache.delete_prefix(prefix)

    def exists(self, key: str) -> bool:
        return self.canonical.exists(key)

    def sweep_expired(self) -> int:
        """Elimina de la caché los ficheros más antiguos que el TTL. Devuelve cuántos."""
        root = Path(self.cache.root)
        if not root.exists():
            return 0
        cutoff = time.time() - self.ttl_seconds
        removed = 0
        for path in root.rglob("*"):
            if path.is_file() and path.stat().st_mtime < cutoff:
                try:
                    path.unlink()
                    removed += 1
                except OSError:
                    pass
        return removed
