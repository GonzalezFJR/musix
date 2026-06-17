"""Almacenamiento en S3 (o S3-compatible: MinIO, etc.) vía boto3.

boto3 es una dependencia opcional (extra "s3"): se importa de forma perezosa
para que el desarrollo local con almacenamiento en disco no la requiera.
"""

from __future__ import annotations

from typing import Optional

from .base import StorageBackend


class S3Storage(StorageBackend):
    def __init__(
        self,
        bucket: str,
        region: str = "eu-west-1",
        endpoint_url: Optional[str] = None,
        prefix: str = "",
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
    ):
        try:
            import boto3  # import perezoso (extra "s3")
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "STORAGE_BACKEND=s3 requiere boto3. Instala el extra: pip install '.[s3]'"
            ) from exc

        if not bucket:
            raise RuntimeError("STORAGE_BACKEND=s3 requiere S3_BUCKET")

        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self._client = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key_id or None,
            aws_secret_access_key=secret_access_key or None,
        )

    def _full(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key

    def put(self, key: str, data: bytes) -> None:
        self._client.put_object(Bucket=self.bucket, Key=self._full(key), Body=data)

    def get(self, key: str) -> bytes:
        from botocore.exceptions import ClientError

        try:
            resp = self._client.get_object(Bucket=self.bucket, Key=self._full(key))
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in ("NoSuchKey", "404"):
                raise FileNotFoundError(key) from exc
            raise
        return resp["Body"].read()

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket, Key=self._full(key))

    def delete_prefix(self, prefix: str) -> None:
        full = self._full(prefix)
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=full):
            objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if objs:
                self._client.delete_objects(Bucket=self.bucket, Delete={"Objects": objs})

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._client.head_object(Bucket=self.bucket, Key=self._full(key))
            return True
        except ClientError:
            return False
