from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select

from ..config import get_settings
from ..deps import CurrentUser, DbSession
from ..models import DEFAULT_ROLE, THEMES, User
from ..schemas import Token, UserCreate, UserProfileUpdate, UserRead
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, session: DbSession) -> User:
    if not settings.allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "El registro está deshabilitado")
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ese email ya está registrado")
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=DEFAULT_ROLE,
        display_name=data.display_name or data.email.split("@")[0],
        author_name=data.author_name,
        first_name=data.first_name,
        last_name=data.last_name,
        location=data.location,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: DbSession,
) -> Token:
    # OAuth2PasswordRequestForm usa "username"; aquí es el email.
    user = session.exec(select(User).where(User.email == form.username)).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user.email))


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(data: UserProfileUpdate, user: CurrentUser, session: DbSession) -> User:
    fields = data.model_dump(exclude_unset=True)
    if "theme" in fields and fields["theme"] not in THEMES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tema no válido")
    for key, value in fields.items():
        if value is not None:
            setattr(user, key, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
