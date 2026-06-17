"""Envío de email vía SMTP (AWS SES u otro). Stdlib `smtplib`."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

logger = logging.getLogger(__name__)


def send_mail(to: str, subject: str, html: str, *, reply_to: str | None = None) -> bool:
    """Envía un email HTML. Devuelve True si se envió. Si no hay SMTP configurado,
    registra el contenido (modo dev) y devuelve False."""
    settings = get_settings()

    if not settings.smtp_host:
        logger.info("[email:dev] Para=%s Asunto=%s\n%s", to, subject, html)
        return False

    msg = EmailMessage()
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from}>"
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content("Tu cliente no soporta HTML.")
    msg.add_alternative(html, subtype="html")

    try:
        if settings.smtp_ssl:
            server: smtplib.SMTP = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        with server:
            if settings.smtp_starttls and not settings.smtp_ssl:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:  # noqa: BLE001
        logger.exception("Fallo enviando email a %s", to)
        return False
