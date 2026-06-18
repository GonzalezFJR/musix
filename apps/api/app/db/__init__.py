"""Factory de repositorios de metadatos (DynamoDB single-table)."""

from __future__ import annotations

from functools import lru_cache

from .base import (
    ContactRepository,
    EventRepository,
    FolderRepository,
    JobRepository,
    ProjectRepository,
    Repositories,
    ResetTokenRepository,
    StatsRepository,
    UserRepository,
)

__all__ = [
    "Repositories",
    "UserRepository",
    "FolderRepository",
    "ProjectRepository",
    "EventRepository",
    "ResetTokenRepository",
    "ContactRepository",
    "StatsRepository",
    "JobRepository",
    "get_repositories",
]


@lru_cache
def get_repositories() -> Repositories:
    from ..config import get_settings

    settings = get_settings()
    if settings.db_backend == "sqlite":
        from .sqlite import SqliteRepositories

        return SqliteRepositories(settings.sqlite_path)

    from .dynamo import DynamoRepositories

    return DynamoRepositories()
