"""Adaptador DynamoDB — STUB (preparación para producción).

Diseño de tablas ligeras previsto (lo "gordo" —el score— va a S3 como `.mu6`):

  {prefix}users
    PK: pk = "USER#{email}"          SK: sk = "PROFILE"
    attrs: id, email, hashed_password, role, display_name, author_name,
           first_name, last_name, location, theme, preferences, created_at
    GSI1 (por id): gsi1pk = "USERID#{id}"

  {prefix}projects
    PK: pk = "USER#{owner_id}"       SK: sk = "PROJECT#{project_id}"
    attrs: id, owner_id, folder_id, title, artist, description, has_score,
           original_filename, created_at, updated_at
    GSI1 (por carpeta): gsi1pk = "USER#{owner_id}#FOLDER#{folder_id}"

  {prefix}folders
    PK: pk = "USER#{owner_id}"       SK: sk = "FOLDER#{folder_id}"
    attrs: id, owner_id, name, parent_id, created_at

Cuando se implemente, este módulo usará boto3 (extra "aws") respetando
settings.dynamodb_region / dynamodb_endpoint_url / dynamodb_table_prefix.
La interfaz es la misma que SqlRepositories (ver app/db/base.py), por lo que los
routers no cambian al activar DB_BACKEND=dynamodb.
"""

from __future__ import annotations

from typing import Optional

from ..models import Folder, Project, User

_NOT_IMPLEMENTED = (
    "El backend DynamoDB es un stub de preparación para producción. "
    "Usa DB_BACKEND=sql en desarrollo."
)


class _DynamoUserRepository:
    def get_by_id(self, user_id: int) -> Optional[User]:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def get_by_email(self, email: str) -> Optional[User]:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def create(self, user: User) -> User:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def update(self, user: User) -> User:
        raise NotImplementedError(_NOT_IMPLEMENTED)


class _DynamoFolderRepository:
    def list_for_owner(self, owner_id: int) -> list[Folder]:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def get_owned(self, folder_id: int, owner_id: int) -> Optional[Folder]:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def create(self, folder: Folder) -> Folder:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def update(self, folder: Folder) -> Folder:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def delete(self, folder: Folder) -> None:
        raise NotImplementedError(_NOT_IMPLEMENTED)


class _DynamoProjectRepository:
    def list_for_owner(self, owner_id: int) -> list[Project]:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def get_owned(self, project_id: int, owner_id: int) -> Optional[Project]:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def create(self, project: Project) -> Project:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def update(self, project: Project) -> Project:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def delete(self, project: Project) -> None:
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def reassign_folder(
        self, from_folder_id: int, to_folder_id: Optional[int], owner_id: int
    ) -> None:
        raise NotImplementedError(_NOT_IMPLEMENTED)


class DynamoRepositories:
    def __init__(self) -> None:
        self.users = _DynamoUserRepository()
        self.folders = _DynamoFolderRepository()
        self.projects = _DynamoProjectRepository()
