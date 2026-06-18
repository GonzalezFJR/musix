"""Inicialización del backend de datos (DynamoDB single-table).

En desarrollo (DynamoDB Local, detectado por `dynamodb_endpoint_url`) crea la
tabla con sus GSIs si no existe. En AWS real la tabla se crea por IaC/consola;
aquí solo se comprueba su existencia. Tras ello, siembra el usuario admin.
"""

from __future__ import annotations

import logging

from .config import get_settings
from .db import get_repositories
from .models import User
from .security import hash_password

logger = logging.getLogger(__name__)
settings = get_settings()


def init_db() -> None:
    # SQLite (dev local) crea su esquema en el constructor de SqliteRepositories;
    # solo DynamoDB necesita asegurar la tabla aquí.
    if settings.db_backend != "sqlite":
        _ensure_table()
    _ensure_admin_user()


def _ensure_table() -> None:
    import boto3

    kwargs: dict = {"region_name": settings.aws_region}
    if settings.dynamodb_endpoint_url:
        kwargs["endpoint_url"] = settings.dynamodb_endpoint_url
    kwargs["aws_access_key_id"] = settings.aws_access_key or "local"
    kwargs["aws_secret_access_key"] = settings.aws_secret_key or "local"
    client = boto3.client("dynamodb", **kwargs)

    try:
        client.describe_table(TableName=settings.dynamodb_table)
        return  # ya existe
    except client.exceptions.ResourceNotFoundException:
        pass

    if not settings.dynamodb_endpoint_url:
        # En AWS real no creamos la tabla desde la app (la app no debe tener
        # permiso CreateTable). Fallar rápido con un mensaje claro.
        raise RuntimeError(
            f"La tabla DynamoDB '{settings.dynamodb_table}' no existe. "
            "Créala por IaC/consola en AWS antes de arrancar."
        )

    logger.info("Creando tabla DynamoDB Local '%s'…", settings.dynamodb_table)
    client.create_table(
        TableName=settings.dynamodb_table,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
            {"AttributeName": "gsi1pk", "AttributeType": "S"},
            {"AttributeName": "gsi1sk", "AttributeType": "S"},
            {"AttributeName": "gsi3pk", "AttributeType": "S"},
            {"AttributeName": "gsi3sk", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "pk", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "GSI1",
                "KeySchema": [
                    {"AttributeName": "gsi1pk", "KeyType": "HASH"},
                    {"AttributeName": "gsi1sk", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "GSI3",
                "KeySchema": [
                    {"AttributeName": "gsi3pk", "KeyType": "HASH"},
                    {"AttributeName": "gsi3sk", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
    )
    client.get_waiter("table_exists").wait(TableName=settings.dynamodb_table)
    # TTL para tokens de reseteo / eventos efímeros (best-effort; Local lo acepta).
    try:
        client.update_time_to_live(
            TableName=settings.dynamodb_table,
            TimeToLiveSpecification={"Enabled": True, "AttributeName": "ttl"},
        )
    except Exception:  # noqa: BLE001 — Local puede no soportarlo; no es crítico
        pass


def _ensure_admin_user() -> None:
    if not (settings.admin_username and settings.admin_password):
        return
    repos = get_repositories()
    existing = repos.users.get_by_email(settings.admin_username)
    if existing is None:
        repos.users.create(
            User(
                email=settings.admin_username,
                hashed_password=hash_password(settings.admin_password),
                display_name="Admin",
                role="admin",
            )
        )
        logger.info("Usuario admin sembrado: %s", settings.admin_username)
    elif existing.role != "admin":
        existing.role = "admin"
        repos.users.update(existing)
