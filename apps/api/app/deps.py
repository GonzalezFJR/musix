from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select

from .config import get_settings
from .database import get_session
from .db import Repositories, get_repositories
from .models import User
from .security import decode_token

# auto_error=False: sin token devuelve None en vez de 401, para poder soportar
# el modo de desarrollo sin autenticación (AUTH_DISABLED).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Nota: evitar TLDs reservados como .local; EmailStr (email-validator) los rechaza.
DEV_USER_EMAIL = "dev@example.com"


def _get_or_create_dev_user(session: Session) -> User:
    user = session.exec(select(User).where(User.email == DEV_USER_EMAIL)).first()
    if user is None:
        # En dev el usuario fijo es admin: así /docs y rutas admin son accesibles.
        user = User(
            email=DEV_USER_EMAIL, hashed_password="!", display_name="Dev", role="admin"
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    elif user.role != "admin":
        user.role = "admin"
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def get_current_user(
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    # Modo desarrollo: ignora el token y usa un usuario fijo (admin).
    if get_settings().auth_disabled:
        return _get_or_create_dev_user(session)

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
    user = session.exec(select(User).where(User.email == subject)).first()
    if user is None:
        raise credentials_exc
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol de administrador")
    return user


# El render de audio (FluidSynth/sfizz + ffmpeg) es lo único intensivo del backend,
# así que su uso (export a MP3 y catálogo de instrumentos de render) se reserva a
# cuentas de pago y administradores.
RENDER_ROLES = ("pro", "admin")


def require_render_access(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in RENDER_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "El render de audio está disponible para cuentas Pro.",
        )
    return user


def get_repos(session: Annotated[Session, Depends(get_session)]) -> Repositories:
    return get_repositories(session)


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
RenderUser = Annotated[User, Depends(require_render_access)]
DbSession = Annotated[Session, Depends(get_session)]
Repos = Annotated[Repositories, Depends(get_repos)]
