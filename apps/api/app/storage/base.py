"""Abstracción de almacenamiento de ficheros de proyecto.

Cada usuario tiene una jerarquía de claves:

    users/{user_id}/projects/{project_id}/score.mu6      (formato propio JSON)
    users/{user_id}/projects/{project_id}/original{ext}  (fichero importado)

Las implementaciones concretas (local, S3) traducen estas claves a rutas de
disco o a objetos del bucket. Lo "gordo" (el score) vive aquí, no en la BD.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    def put(self, key: str, data: bytes) -> None:
        """Guarda (o sobrescribe) el objeto en `key`."""

    @abstractmethod
    def get(self, key: str) -> bytes:
        """Devuelve los bytes del objeto. Lanza FileNotFoundError si no existe."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Borra el objeto si existe (idempotente)."""

    @abstractmethod
    def delete_prefix(self, prefix: str) -> None:
        """Borra todos los objetos bajo `prefix` (idempotente)."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """True si el objeto existe."""


def project_prefix(user_id: str, project_id: str) -> str:
    return f"users/{user_id}/projects/{project_id}"


def score_key(user_id: str, project_id: str) -> str:
    return f"{project_prefix(user_id, project_id)}/score.mu6"


def original_key(user_id: str, project_id: str, ext: str) -> str:
    return f"{project_prefix(user_id, project_id)}/original{ext}"
