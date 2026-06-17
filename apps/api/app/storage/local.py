"""Almacenamiento local en disco. Impl. por defecto en desarrollo."""

from __future__ import annotations

import shutil
from pathlib import Path

from .base import StorageBackend


class LocalStorage(StorageBackend):
    def __init__(self, root: Path):
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        # Las claves usan "/" como separador lógico; las mapeamos a subrutas.
        p = (self.root / key).resolve()
        # Defensa básica contra path traversal.
        if not str(p).startswith(str(self.root.resolve())):
            raise ValueError(f"Clave fuera de la raíz de almacenamiento: {key}")
        return p

    def put(self, key: str, data: bytes) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def get(self, key: str) -> bytes:
        p = self._path(key)
        if not p.exists():
            raise FileNotFoundError(key)
        return p.read_bytes()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            p.unlink()

    def delete_prefix(self, prefix: str) -> None:
        p = self._path(prefix)
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        elif p.exists():
            p.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()
