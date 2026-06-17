"""Implementación SQL (SQLModel) de los repositorios. Impl. real por defecto."""

from __future__ import annotations

from typing import Optional

from sqlmodel import Session, select

from ..models import Folder, Project, User


class SqlUserRepository:
    def __init__(self, session: Session):
        self.s = session

    def get_by_id(self, user_id: int) -> Optional[User]:
        return self.s.get(User, user_id)

    def get_by_email(self, email: str) -> Optional[User]:
        return self.s.exec(select(User).where(User.email == email)).first()

    def create(self, user: User) -> User:
        self.s.add(user)
        self.s.commit()
        self.s.refresh(user)
        return user

    def update(self, user: User) -> User:
        self.s.add(user)
        self.s.commit()
        self.s.refresh(user)
        return user


class SqlFolderRepository:
    def __init__(self, session: Session):
        self.s = session

    def list_for_owner(self, owner_id: int) -> list[Folder]:
        stmt = select(Folder).where(Folder.owner_id == owner_id).order_by(Folder.name)
        return list(self.s.exec(stmt).all())

    def get_owned(self, folder_id: int, owner_id: int) -> Optional[Folder]:
        folder = self.s.get(Folder, folder_id)
        if folder is None or folder.owner_id != owner_id:
            return None
        return folder

    def create(self, folder: Folder) -> Folder:
        self.s.add(folder)
        self.s.commit()
        self.s.refresh(folder)
        return folder

    def update(self, folder: Folder) -> Folder:
        self.s.add(folder)
        self.s.commit()
        self.s.refresh(folder)
        return folder

    def delete(self, folder: Folder) -> None:
        self.s.delete(folder)
        self.s.commit()


class SqlProjectRepository:
    def __init__(self, session: Session):
        self.s = session

    def list_for_owner(self, owner_id: int) -> list[Project]:
        stmt = (
            select(Project)
            .where(Project.owner_id == owner_id)
            .order_by(Project.updated_at.desc())
        )
        return list(self.s.exec(stmt).all())

    def get_owned(self, project_id: int, owner_id: int) -> Optional[Project]:
        project = self.s.get(Project, project_id)
        if project is None or project.owner_id != owner_id:
            return None
        return project

    def create(self, project: Project) -> Project:
        self.s.add(project)
        self.s.commit()
        self.s.refresh(project)
        return project

    def update(self, project: Project) -> Project:
        self.s.add(project)
        self.s.commit()
        self.s.refresh(project)
        return project

    def delete(self, project: Project) -> None:
        self.s.delete(project)
        self.s.commit()

    def reassign_folder(
        self, from_folder_id: int, to_folder_id: Optional[int], owner_id: int
    ) -> None:
        stmt = select(Project).where(
            Project.owner_id == owner_id, Project.folder_id == from_folder_id
        )
        for project in self.s.exec(stmt).all():
            project.folder_id = to_folder_id
            self.s.add(project)
        self.s.commit()


class SqlRepositories:
    def __init__(self, session: Session):
        self.users = SqlUserRepository(session)
        self.folders = SqlFolderRepository(session)
        self.projects = SqlProjectRepository(session)
