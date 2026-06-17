#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Musix — descarga de bancos de sonido (a mano, una vez)
# Lee soundbanks/manifest.json y descarga/ordena los paquetes en
# soundbanks/. Idempotente: omite lo ya presente. No versiona nada.
#
#   scripts/fetch-soundbanks.sh                 → solo los "default" (base)
#   scripts/fetch-soundbanks.sh vcsl salamander → por id
#   scripts/fetch-soundbanks.sh --all           → todos con descarga automática
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SB="$ROOT/soundbanks"
MAN="$SB/manifest.json"

log()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
err()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

command -v jq >/dev/null 2>&1 || { err "Falta 'jq' (sudo apt install jq)."; exit 1; }
command -v curl >/dev/null 2>&1 || { err "Falta 'curl'."; exit 1; }

mkdir -p "$SB/sf2" "$SB/sfz" "$SB/licenses"

# ── Selección de ids a procesar ─────────────────────────────────
ALL=false
IDS=()
for a in "$@"; do
  [ "$a" = "--all" ] && ALL=true || IDS+=("$a")
done

mapfile -t MANIFEST_IDS < <(jq -r '.soundbanks[].id' "$MAN")

selected() {
  local id="$1"
  if $ALL; then return 0; fi
  if [ "${#IDS[@]}" -gt 0 ]; then
    for x in "${IDS[@]}"; do [ "$x" = "$id" ] && return 0; done
    return 1
  fi
  # sin argumentos → solo los default
  [ "$(jq -r --arg id "$id" '.soundbanks[]|select(.id==$id)|.default' "$MAN")" = "true" ]
}

field() { jq -r --arg id "$1" ".soundbanks[]|select(.id==\$id)|.$2 // empty" "$MAN"; }

download_file() {  # url dest
  local url="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  log "Descargando $(basename "$dest")…"
  if curl -fL --retry 3 --connect-timeout 20 -o "$dest.part" "$url"; then
    mv "$dest.part" "$dest"
    ok "→ ${dest#$SB/}"
  else
    rm -f "$dest.part"
    err "Falló la descarga de $url"
    return 1
  fi
}

extract() {  # archive dest_dir type
  local arc="$1" dir="$2" type="$3"
  mkdir -p "$dir"
  log "Extrayendo en ${dir#$SB/}…"
  case "$type" in
    zip)    command -v unzip >/dev/null || { err "Falta 'unzip'."; return 1; }; unzip -q -o "$arc" -d "$dir" ;;
    tar.xz) tar -xJf "$arc" -C "$dir" ;;
    tar.gz) tar -xzf "$arc" -C "$dir" ;;
    7z)
      if command -v 7z >/dev/null;   then 7z x -y -o"$dir" "$arc" >/dev/null
      elif command -v 7za >/dev/null; then 7za x -y -o"$dir" "$arc" >/dev/null
      elif command -v bsdtar >/dev/null; then bsdtar -xf "$arc" -C "$dir"
      elif python3 -c "import py7zr" 2>/dev/null; then
        python3 -c "import py7zr,sys; py7zr.SevenZipFile(sys.argv[1]).extractall(sys.argv[2])" "$arc" "$dir"
      else err "Para .7z instala p7zip-full (7z), o libarchive (bsdtar), o 'pip install py7zr'."; return 1
      fi ;;
    *)      err "Tipo de archivo no soportado: $type"; return 1 ;;
  esac
  rm -f "$arc"
}

PROCESSED=0
NEEDS_MANUAL=()

for id in "${MANIFEST_IDS[@]}"; do
  selected "$id" || continue
  PROCESSED=$((PROCESSED+1))
  name="$(field "$id" name)"
  license="$(field "$id" license)"
  attr_req="$(field "$id" attribution_required)"
  attr="$(field "$id" attribution)"
  download="$(field "$id" download)"
  source="$(field "$id" source)"

  echo
  log "[$id] $name  —  licencia: $license"
  [ "$attr_req" = "true" ] && warn "Requiere ATRIBUCIÓN: $attr"

  # Guarda un recordatorio de atribución/licencia (el texto legal real va a mano).
  printf '%s\nLicencia: %s\nAtribución: %s\nOrigen: %s\n' "$name" "$license" "$attr" "$source" \
    > "$SB/licenses/$id.txt"

  if [ -z "$download" ] || [ "$download" = "null" ]; then
    warn "Sin descarga automática. Descárgalo a mano desde:"
    warn "  $source"
    warn "  y colócalo en: soundbanks/$(field "$id" dest_dir)"
    NEEDS_MANUAL+=("$id → $source")
    continue
  fi

  archive="$(field "$id" archive)"
  if [ -n "$archive" ]; then
    dest_dir="$SB/$(field "$id" dest_dir)"
    if [ -d "$dest_dir" ] && [ -n "$(ls -A "$dest_dir" 2>/dev/null)" ]; then
      ok "Ya presente: ${dest_dir#$SB/} (omito)"; continue
    fi
    tmp="$SB/.dl-$id.$archive"
    download_file "$download" "$tmp" || continue
    extract "$tmp" "$dest_dir" "$archive" || continue
    ok "Listo: ${dest_dir#$SB/}"
  else
    dest="$SB/$(field "$id" dest)"
    if [ -f "$dest" ]; then ok "Ya presente: ${dest#$SB/} (omito)"; continue; fi
    download_file "$download" "$dest" || continue
  fi
done

echo
[ "$PROCESSED" -eq 0 ] && warn "Nada seleccionado. Usa ids del manifest o --all."
if [ "${#NEEDS_MANUAL[@]}" -gt 0 ]; then
  echo
  warn "Pendientes de descarga manual:"
  for m in "${NEEDS_MANUAL[@]}"; do echo "    $m"; done
fi
echo
ok "Hecho. Bancos en: soundbanks/ (montado como /soundbanks en los contenedores)."
