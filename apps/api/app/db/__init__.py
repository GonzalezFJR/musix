"""Factory de repositorios de metadatos (DynamoDB single-table)."""

from __future__ import annotations

from functools import lru_cache

from .base import (
    ContactRepository,
    EventRepository,
    FolderRepository,
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
    "get_repositories",
]


@lru_cache
def get_repositories() -> Repositories:
    from .dynamo import DynamoRepositories

    return DynamoRepositories()
