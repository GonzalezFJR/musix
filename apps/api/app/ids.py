"""Generación de identificadores.

Usamos ULID (string de 26 chars Crockford base32): ordenable lexicográficamente
por tiempo de creación, lo que da orden temporal "gratis" en las sort keys de
DynamoDB (`PROJECT#{ulid}`, `LOGIN#{ulid}`, …).
"""

from __future__ import annotations

from ulid import ULID


def new_id() -> str:
    return str(ULID())
