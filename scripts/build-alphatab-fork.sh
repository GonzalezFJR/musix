#!/usr/bin/env bash
# Compila el fork de AlphaTab (TS) y lo empaqueta para que lo consuma apps/web.
# Uso: ./scripts/build-alphatab-fork.sh   (luego: docker compose up -d --build web)
set -euo pipefail
cd "$(dirname "$0")/.."

FORK_ROOT="vendor/alphatab"
FORK_PKG="$FORK_ROOT/packages/alphatab"

if [ ! -d "$FORK_ROOT/node_modules" ]; then
  echo "▶ Instalando dependencias del fork (primera vez)…"
  ( cd "$FORK_ROOT" && npm install )
fi

echo "▶ Compilando el fork (genera dist desde la fuente TS)…"
( cd "$FORK_ROOT" && npm run build )

echo "▶ Empaquetando…"
( cd "$FORK_PKG" && rm -f coderline-alphatab-*.tgz && npm pack --ignore-scripts )

cp "$FORK_PKG"/coderline-alphatab-*.tgz apps/web/alphatab-fork.tgz
echo "✓ Listo → apps/web/alphatab-fork.tgz"
echo "  Reconstruye la web:  docker compose up -d --build web"
