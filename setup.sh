#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Musix — script maestro de instalación y arranque (Ubuntu / Debian)
# Instala Docker si falta, prepara .env con secretos, y levanta todo.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

log()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
err()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

# ── 1. Docker ───────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Docker no encontrado. Instalando (requiere sudo)…"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  warn "Añadido a grupo 'docker'. Quizá debas reiniciar sesión para usar docker sin sudo."
else
  log "Docker ya instalado: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  err "El plugin 'docker compose' no está disponible. Instala docker-compose-plugin."
  exit 1
fi

# ── 2. .env ─────────────────────────────────────────────────────
if [ ! -f .env ]; then
  log "Creando .env desde .env.example…"
  cp .env.example .env
fi

gen_secret() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 256; }

# Rellena SECRET_KEY si está vacía
if grep -qE '^SECRET_KEY=$' .env; then
  log "Generando SECRET_KEY…"
  sed -i "s|^SECRET_KEY=$|SECRET_KEY=$(gen_secret)|" .env
fi

# Sustituye la contraseña de postgres por defecto
if grep -qE '^POSTGRES_PASSWORD=change-me-in-setup$' .env; then
  log "Generando POSTGRES_PASSWORD…"
  sed -i "s|^POSTGRES_PASSWORD=change-me-in-setup$|POSTGRES_PASSWORD=$(gen_secret)|" .env
fi

# ── 3. Arranque ─────────────────────────────────────────────────
DC="docker compose"
command -v docker >/dev/null && docker info >/dev/null 2>&1 || DC="sudo docker compose"

log "Construyendo y levantando contenedores…"
$DC up -d --build

log "Estado:"
$DC ps

SITE_VAL=$(grep -E '^SITE_ADDRESS=' .env | cut -d= -f2)
echo
log "¡Listo! Abre: ${SITE_VAL:-http://localhost}"
warn "Para HTTPS en producción: pon tu dominio en SITE_ADDRESS (ej. musix.midominio.com)"
warn "y un email válido en ACME_EMAIL en .env, luego reejecuta ./setup.sh"
