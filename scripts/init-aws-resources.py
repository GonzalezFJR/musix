#!/usr/bin/env python3
"""Aprovisiona/valida los recursos AWS de Musix (idempotente).

- Crea la tabla DynamoDB single-table con pk/sk + GSI1 + GSI3 (PAY_PER_REQUEST)
  y activa TTL en `ttl`, si no existe.
- Crea el bucket S3 si no existe.
- Sirve también como prueba de credenciales/conectividad.

Lee la config desde el entorno (mismas variables que la app):
  AWS_REGION, AWS_ACCESS_KEY, AWS_SECRET_KEY, DYNAMODB_TABLE, S3_BUCKET_NAME

Uso (en el directorio del repo, con el .env cargado):
  set -a; . ./.env; set +a; python3 scripts/init-aws-resources.py
"""

import os
import sys

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("AWS_REGION", "eu-west-1")
KEY = os.environ.get("AWS_ACCESS_KEY") or None
SECRET = os.environ.get("AWS_SECRET_KEY") or None
TABLE = os.environ.get("DYNAMODB_TABLE", "musix")
BUCKET = os.environ.get("S3_BUCKET_NAME") or ""

session = boto3.session.Session(
    region_name=REGION, aws_access_key_id=KEY, aws_secret_access_key=SECRET
)


def ensure_table() -> None:
    ddb = session.client("dynamodb")
    try:
        ddb.describe_table(TableName=TABLE)
        print(f"✓ DynamoDB: la tabla '{TABLE}' ya existe")
        return
    except ddb.exceptions.ResourceNotFoundException:
        pass
    print(f"▶ Creando tabla DynamoDB '{TABLE}'…")
    ddb.create_table(
        TableName=TABLE,
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
    ddb.get_waiter("table_exists").wait(TableName=TABLE)
    try:
        ddb.update_time_to_live(
            TableName=TABLE,
            TimeToLiveSpecification={"Enabled": True, "AttributeName": "ttl"},
        )
    except ClientError as exc:
        print(f"  (aviso: no se pudo activar TTL: {exc})")
    print(f"✓ DynamoDB: tabla '{TABLE}' creada")


GSIS = {
    "GSI1": ("gsi1pk", "gsi1sk"),
    "GSI3": ("gsi3pk", "gsi3sk"),
}


def _wait_indexes_active(ddb) -> None:
    import time

    for _ in range(120):
        desc = ddb.describe_table(TableName=TABLE)["Table"]
        idx = desc.get("GlobalSecondaryIndexes", [])
        if desc["TableStatus"] == "ACTIVE" and all(i["IndexStatus"] == "ACTIVE" for i in idx):
            return
        time.sleep(5)
    raise RuntimeError("Timeout esperando que los índices queden ACTIVE")


def ensure_gsis() -> None:
    """Añade GSI1/GSI3 a una tabla existente si faltan (uno por UpdateTable)."""
    ddb = session.client("dynamodb")
    desc = ddb.describe_table(TableName=TABLE)["Table"]
    existing = {i["IndexName"] for i in desc.get("GlobalSecondaryIndexes", [])}
    for name, (hk, rk) in GSIS.items():
        if name in existing:
            print(f"✓ DynamoDB: índice {name} ya existe")
            continue
        print(f"▶ Añadiendo índice {name} ({hk}/{rk})… (puede tardar)")
        _wait_indexes_active(ddb)  # UpdateTable exige tabla ACTIVE
        ddb.update_table(
            TableName=TABLE,
            AttributeDefinitions=[
                {"AttributeName": hk, "AttributeType": "S"},
                {"AttributeName": rk, "AttributeType": "S"},
            ],
            GlobalSecondaryIndexUpdates=[
                {
                    "Create": {
                        "IndexName": name,
                        "KeySchema": [
                            {"AttributeName": hk, "KeyType": "HASH"},
                            {"AttributeName": rk, "KeyType": "RANGE"},
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                    }
                }
            ],
        )
        _wait_indexes_active(ddb)
        print(f"✓ DynamoDB: índice {name} creado y activo")


def ensure_bucket() -> None:
    if not BUCKET:
        print("• S3: S3_BUCKET_NAME vacío → se omite (almacenamiento solo local)")
        return
    s3 = session.client("s3")
    try:
        s3.head_bucket(Bucket=BUCKET)
        print(f"✓ S3: el bucket '{BUCKET}' ya existe y es accesible")
        return
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code not in ("404", "NoSuchBucket"):
            print(f"✗ S3: error accediendo a '{BUCKET}': {exc}")
            raise
    print(f"▶ Creando bucket S3 '{BUCKET}' en {REGION}…")
    kwargs = {"Bucket": BUCKET}
    if REGION != "us-east-1":
        kwargs["CreateBucketConfiguration"] = {"LocationConstraint": REGION}
    s3.create_bucket(**kwargs)
    print(f"✓ S3: bucket '{BUCKET}' creado")


if __name__ == "__main__":
    print(f"Región={REGION} Tabla={TABLE} Bucket={BUCKET or '(ninguno)'}")
    try:
        ensure_table()
        ensure_gsis()
        ensure_bucket()
    except Exception as exc:  # noqa: BLE001
        print(f"\n✗ FALLO: {exc}")
        sys.exit(1)
    print("\n✅ Recursos AWS listos y credenciales válidas")
