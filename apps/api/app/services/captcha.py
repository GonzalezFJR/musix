"""Verificación de Cloudflare Turnstile (captcha) en el servidor."""

from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from typing import Optional

from ..config import get_settings

logger = logging.getLogger(__name__)

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_turnstile(token: str, remote_ip: Optional[str] = None) -> bool:
    """True si el token de Turnstile es válido. Con las claves de TEST (dev) pasa siempre."""
    settings = get_settings()
    if not token:
        return False
    data = {"secret": settings.captcha_secret_key, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        req = urllib.request.Request(
            _VERIFY_URL,
            data=urllib.parse.urlencode(data).encode(),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode())
        return bool(payload.get("success"))
    except Exception:  # noqa: BLE001 — red caída → tratamos como fallo de captcha
        logger.warning("Fallo verificando Turnstile", exc_info=True)
        return False
