from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .config import get_settings
from .db import Repositories, get_repositories
from .models import User
from .security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Email del admin local cuando AUTH_DISABLED está activo y no se configuró
# ADMIN_USERNAME explícitamente.
_DEV_ADMIN_EMAIL = "admin@local"


def get_repos() -> Repositories:
    return get_repositories()


def _dev_admin(repos: Repositories) -> User:
    """Devuelve (creándolo si hace falta) el usuario admin local.

    Solo se usa en modo AUTH_DISABLED (desarrollo). Garantiza que exista una
    cuenta admin a la que asociar todas las peticiones sin login.
    """
    from .security import hash_password

    settings = get_settings()
    email = settings.admin_username or _DEV_ADMIN_EMAIL
    user = repos.users.get_by_email(email)
    if user is None:
        user = User(
            email=email,
            hashed_password=hash_password(settings.admin_password or "admin"),
            display_name="Admin (local)",
            role="admin",
        )
        try:
            repos.users.create(user)
        except ValueError:
            user = repos.users.get_by_email(email)
    return user


def get_current_user(
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    repos: Annotated[Repositories, Depends(get_repos)],
) -> User:
    # Modo local sin autenticación: toda petición entra como admin.
    if get_settings().auth_disabled:
        return _dev_admin(repos)
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales no válidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exc
    subject = decode_token(token)
    if subject is None:
        raise credentials_exc
    # `subject` es el id del usuario (ULID).
    user = repos.users.get_by_id(subject)
    if user is None:
        raise credentials_exc
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol de administrador")
    return user


# El render de audio (FluidSynth/sfizz + ffmpeg) es lo único intensivo del backend,
# así que se reserva a cuentas de pago y administradores.
RENDER_ROLES = ("pro", "admin")


def require_render_access(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in RENDER_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "El render de audio está disponible para cuentas Pro.",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
RenderUser = Annotated[User, Depends(require_render_access)]
Repos = Annotated[Repositories, Depends(get_repos)]
