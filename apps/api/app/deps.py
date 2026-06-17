from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .db import Repositories, get_repositories
from .models import User
from .security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_repos() -> Repositories:
    return get_repositories()


def get_current_user(
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    repos: Annotated[Repositories, Depends(get_repos)],
) -> User:
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
