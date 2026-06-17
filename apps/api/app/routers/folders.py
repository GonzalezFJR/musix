from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUser, Repos
from ..models import Folder
from ..schemas import FolderCreate, FolderRead, FolderUpdate

router = APIRouter(prefix="/api/folders", tags=["folders"])


def _owned(folder_id: int, user_id: int, repos) -> Folder:
    folder = repos.folders.get_owned(folder_id, user_id)
    if folder is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carpeta no encontrada")
    return folder


def _validate_parent(parent_id: int, user_id: int, repos) -> None:
    if parent_id is not None and repos.folders.get_owned(parent_id, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carpeta padre no encontrada")


@router.get("", response_model=list[FolderRead])
def list_folders(user: CurrentUser, repos: Repos) -> list[Folder]:
    return repos.folders.list_for_owner(user.id)


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
def create_folder(data: FolderCreate, user: CurrentUser, repos: Repos) -> Folder:
    _validate_parent(data.parent_id, user.id, repos)
    return repos.folders.create(
        Folder(owner_id=user.id, name=data.name.strip() or "Nueva carpeta", parent_id=data.parent_id)
    )


@router.patch("/{folder_id}", response_model=FolderRead)
def update_folder(
    folder_id: int, data: FolderUpdate, user: CurrentUser, repos: Repos
) -> Folder:
    folder = _owned(folder_id, user.id, repos)
    if data.name is not None:
        folder.name = data.name.strip() or folder.name
    if data.parent_id is not None:
        if data.parent_id == folder_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Una carpeta no puede contenerse a sí misma")
        _validate_parent(data.parent_id, user.id, repos)
        folder.parent_id = data.parent_id
    return repos.folders.update(folder)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: int, user: CurrentUser, repos: Repos) -> None:
    folder = _owned(folder_id, user.id, repos)
    # Reasigna los proyectos de la carpeta a la raíz.
    repos.projects.reassign_folder(folder_id, None, user.id)
    # Sube las subcarpetas al padre de la carpeta borrada.
    for child in repos.folders.list_for_owner(user.id):
        if child.parent_id == folder_id:
            child.parent_id = folder.parent_id
            repos.folders.update(child)
    repos.folders.delete(folder)
