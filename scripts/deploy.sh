#!/usr/bin/env bash
# Re-deploy de Musix en minibox: git pull + rebuild + up + health-check.
# Uso (en minibox):  cd ~/musix && ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "▶ git pull…"
git pull --ff-only

echo "▶ build + up…"
$COMPOSE up -d --build

echo "▶ esperando health…"
for i in $(seq 1 20); do
  if curl -sf http://localhost:8088/api/health >/dev/null; then
    echo "✓ API healthy"
    break
  fi
  [ "$i" = 20 ] && { echo "✗ la API no respondió a /api/health"; $COMPOSE logs --tail=30 api; exit 1; }
  sleep 3
done

echo "✓ Despliegue OK"
$COMPOSE ps
echo "  Público: https://mu6.es   ·   logs: $COMPOSE logs -f api"
