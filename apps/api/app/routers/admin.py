from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from ..deps import AdminUser, Repos
from ..models import ROLES
from ..schemas import (
    AdminContactList,
    AdminStats,
    AdminUserDetail,
    AdminUserList,
    AdminUserSummary,
    AdminUserUpdate,
    ContactMessageRead,
    LoginEventRead,
    ProjectSummary,
)
from ..storage import get_storage

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
def admin_stats(admin: AdminUser, repos: Repos) -> AdminStats:
    stats = repos.stats.get()
    logins = [
        LoginEventRead(user_id=e.user_id, email=e.email, created_at=e.created_at)
        for e in repos.events.recent_logins(limit=25)
    ]
    return AdminStats(**stats.model_dump(), recent_logins=logins)


@router.get("/users", response_model=AdminUserList)
def admin_list_users(
    admin: AdminUser,
    repos: Repos,
    cursor: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
) -> AdminUserList:
    users, next_cursor = repos.users.list_all(limit=limit, cursor=cursor)
    summaries = []
    for u in users:
        last = repos.events.last_login_for(u.id)
        summaries.append(
            AdminUserSummary(
                id=u.id,
                email=u.email,
                display_name=u.display_name,
                role=u.role,
                project_count=u.project_count,
                last_login=last.created_at if last else None,
                created_at=u.created_at,
            )
        )
    return AdminUserList(users=summaries, next_cursor=next_cursor)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def admin_get_user(user_id: str, admin: AdminUser, repos: Repos) -> AdminUserDetail:
    user = repos.users.get_by_id(user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    projects = [ProjectSummary(**p.model_dump()) for p in repos.projects.list_for_owner(user.id)]
    last = repos.events.last_login_for(user.id)
    return AdminUserDetail(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        project_count=user.project_count,
        last_login=last.created_at if last else None,
        created_at=user.created_at,
        author_name=user.author_name,
        first_name=user.first_name,
        last_name=user.last_name,
        location=user.location,
        projects=projects,
    )


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
def admin_update_user(
    user_id: str, data: AdminUserUpdate, admin: AdminUser, repos: Repos
) -> AdminUserDetail:
    user = repos.users.get_by_id(user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    old_role = user.role
    if data.role is not None:
        if data.role not in ROLES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Rol no válido")
        user.role = data.role
    if data.display_name is not None:
        user.display_name = data.display_name
    repos.users.update(user)
    if data.role is not None and data.role != old_role:
        repos.stats.bump(role_deltas={old_role: -1, data.role: 1})
    return admin_get_user(user_id, admin, repos)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_user(user_id: str, admin: AdminUser, repos: Repos) -> None:
    user = repos.users.get_by_id(user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes borrarte a ti mismo")
    repos.users.delete(user)
    get_storage().delete_prefix(f"users/{user.id}")


@router.get("/contacts", response_model=AdminContactList)
def admin_list_contacts(
    admin: AdminUser,
    repos: Repos,
    cursor: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
) -> AdminContactList:
    messages, next_cursor = repos.contacts.list_recent(limit=limit, cursor=cursor)
    return AdminContactList(
        messages=[ContactMessageRead(**m.model_dump()) for m in messages],
        next_cursor=next_cursor,
    )


@router.post("/recompute-stats", response_model=AdminStats)
def admin_recompute_stats(admin: AdminUser, repos: Repos) -> AdminStats:
    stats = repos.stats.recompute()
    return AdminStats(**stats.model_dump(), recent_logins=[])
