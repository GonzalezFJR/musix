"""Factory de repositorios de metadatos según `settings.db_backend`."""

from __future__ import annotations

from typing import Optional

from sqlmodel import Session

from ..config import get_settings
from .base import FolderRepository, ProjectRepository, Repositories, UserRepository

__all__ = [
    "Repositories",
    "UserRepository",
    "FolderRepository",
    "ProjectRepository",
    "get_repositories",
]


def get_repositories(session: Optional[Session] = None) -> Repositories:
    settings = get_settings()
    if settings.db_backend == "dynamodb":
        from .dynamo import DynamoRepositories

        return DynamoRepositories()
    # Default: SQL (SQLModel). Requiere una sesión.
    if session is None:
        raise RuntimeError("El backend SQL requiere una sesión de base de datos")
    from .sql import SqlRepositories

    return SqlRepositories(session)
