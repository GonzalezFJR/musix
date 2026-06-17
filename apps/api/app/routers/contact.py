from fastapi import APIRouter, HTTPException, Request, status

from ..config import get_settings
from ..deps import Repos
from ..models import ContactMessage
from ..schemas import ContactRequest
from ..services.captcha import verify_turnstile
from ..services.email import send_mail

router = APIRouter(prefix="/api/contact", tags=["contact"])
settings = get_settings()


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_contact(data: ContactRequest, request: Request, repos: Repos) -> dict:
    ip = request.client.host if request.client else None
    if not verify_turnstile(data.captcha_token, ip):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Captcha no válido")

    message = repos.contacts.create(
        ContactMessage(
            name=data.name.strip(),
            email=data.email,
            subject=data.subject.strip(),
            body=data.message.strip(),
        )
    )

    if settings.mail_to:
        send_mail(
            settings.mail_to,
            f"[Contacto Musix] {message.subject or '(sin asunto)'}",
            f"<p><b>De:</b> {message.name} &lt;{message.email}&gt;</p>"
            f"<p><b>Asunto:</b> {message.subject}</p>"
            f"<hr><p>{message.body}</p>",
            reply_to=message.email,
        )
    return {"ok": True}
