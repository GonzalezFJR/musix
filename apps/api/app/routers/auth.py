import json
import logging
import urllib.parse
import urllib.request
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm

from ..config import get_settings
from ..deps import CurrentUser, Repos
from ..models import DEFAULT_ROLE, THEMES, LoginEvent, PasswordResetToken, User, utcnow
from ..schemas import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserProfileUpdate,
    UserRead,
)
from ..security import (
    create_access_token,
    hash_password,
    new_reset_token,
    sign_state,
    verify_password,
    verify_state,
)
from ..services.captcha import verify_turnstile
from ..services.email import send_mail

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _google_redirect_uri() -> str:
    return f"{settings.public_base_url.rstrip('/')}/api/auth/google/callback"


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, request: Request, repos: Repos) -> User:
    if not settings.allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "El registro está deshabilitado")
    if not verify_turnstile(data.captcha_token, _client_ip(request)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Captcha no válido")
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
    try:
        repos.users.create(user)
    except ValueError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ese email ya está registrado")
    return user


@router.post("/login", response_model=Token)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    request: Request,
    repos: Repos,
) -> Token:
    # OAuth2PasswordRequestForm usa "username"; aquí es el email.
    user = repos.users.get_by_email(form.username)
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    repos.events.record_login(
        LoginEvent(user_id=user.id, email=user.email, ip=_client_ip(request))
    )
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(data: UserProfileUpdate, user: CurrentUser, repos: Repos) -> User:
    fields = data.model_dump(exclude_unset=True)
    if "theme" in fields and fields["theme"] not in THEMES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tema no válido")
    for key, value in fields.items():
        if value is not None:
            setattr(user, key, value)
    return repos.users.update(user)


# ── Recuperación de contraseña ───────────────────────────────────
@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(data: ForgotPasswordRequest, request: Request, repos: Repos) -> dict:
    if not verify_turnstile(data.captcha_token, _client_ip(request)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Captcha no válido")
    user = repos.users.get_by_email(data.email)
    # Respuesta uniforme: no revelar si el email existe.
    if user:
        token = new_reset_token()
        repos.reset_tokens.create(
            PasswordResetToken(
                token=token,
                user_id=user.id,
                email=user.email,
                expires_at=utcnow() + timedelta(hours=1),
            )
        )
        link = f"{settings.public_base_url.rstrip('/')}/reset-password?token={token}"
        send_mail(
            user.email,
            "Recupera tu contraseña — Musix",
            f"<p>Has solicitado recuperar tu contraseña.</p>"
            f'<p><a href="{link}">Pulsa aquí para establecer una nueva</a> (caduca en 1 hora).</p>'
            f"<p>Si no fuiste tú, ignora este mensaje.</p>",
        )
    return {"ok": True}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(data: ResetPasswordRequest, request: Request, repos: Repos) -> dict:
    if not verify_turnstile(data.captcha_token, _client_ip(request)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Captcha no válido")
    entry = repos.reset_tokens.get(data.token)
    if entry is None or entry.expires_at < utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enlace inválido o caducado")
    user = repos.users.get_by_id(entry.user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enlace inválido")
    user.hashed_password = hash_password(data.password)
    repos.users.update(user)
    repos.reset_tokens.delete(data.token)
    return {"ok": True}


# ── Google OAuth2 (Authorization Code) ───────────────────────────
@router.get("/google/login")
def google_login() -> RedirectResponse:
    if not settings.google_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Login con Google no disponible")
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": _google_redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": sign_state({"k": "google"}),
        "access_type": "online",
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}")


@router.get("/google/callback")
def google_callback(code: str, state: str, repos: Repos) -> RedirectResponse:
    if not settings.google_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Login con Google no disponible")
    if verify_state(state) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Estado OAuth no válido")

    # 1) Intercambiar el code por tokens.
    token_body = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": _google_redirect_uri(),
            "grant_type": "authorization_code",
        }
    ).encode()
    try:
        with urllib.request.urlopen(
            urllib.request.Request(GOOGLE_TOKEN_URL, data=token_body, method="POST"), timeout=10
        ) as resp:
            tokens = json.loads(resp.read().decode())
        access_token = tokens["access_token"]
        # 2) Userinfo (sub, email, name).
        with urllib.request.urlopen(
            urllib.request.Request(
                GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            ),
            timeout=10,
        ) as resp:
            info = json.loads(resp.read().decode())
    except Exception as exc:  # noqa: BLE001
        logger.exception("Fallo en el intercambio OAuth de Google")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No se pudo completar el login con Google") from exc

    sub = info.get("sub")
    email = (info.get("email") or "").strip()
    if not sub or not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google no devolvió email")

    user = repos.users.get_by_google_sub(sub)
    if user is None:
        user = repos.users.get_by_email(email)
        if user is None:
            user = User(
                email=email,
                hashed_password="",  # cuenta solo-Google
                role=DEFAULT_ROLE,
                display_name=info.get("name") or email.split("@")[0],
                google_sub=sub,
            )
            repos.users.create(user)
        elif not user.google_sub:
            user.google_sub = sub
            repos.users.update(user)

    repos.events.record_login(LoginEvent(user_id=user.id, email=user.email))
    jwt_token = create_access_token(user.id)
    return RedirectResponse(
        f"{settings.public_base_url.rstrip('/')}/auth/callback#access_token={jwt_token}"
    )
