#!/usr/bin/env bash
# Sube la copia local de soundbanks a S3 (fuente de verdad en producción).
# Uso: AWS_PROFILE=... ./scripts/push-soundbanks-s3.sh
# Requiere: awscli, y las variables S3_BUCKET_NAME / SOUNDBANKS_S3_PREFIX (o edítalas abajo).
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${S3_BUCKET_NAME:?Define S3_BUCKET_NAME}"
PREFIX="${SOUNDBANKS_S3_PREFIX:-soundbanks}"
SRC="${SOUNDBANKS_DIR:-./soundbanks}"
REGION="${AWS_REGION:-eu-west-1}"

echo "▶ Subiendo $SRC → s3://$BUCKET/$PREFIX/ (región $REGION)…"
aws s3 sync "$SRC" "s3://$BUCKET/$PREFIX" --region "$REGION" --exclude ".git*"
echo "✓ Soundbanks subidos. El backend los sincronizará a local al arrancar."
