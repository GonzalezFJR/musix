# Musix — guía de despliegue y operación

Este documento explica cómo se despliega Musix en producción. Lo leen tanto
personas como agentes (Claude Code, etc.); manténlo actualizado.

## Arquitectura de producción

```
Navegador ──HTTPS──> EC2 (nginx + certbot)  ──tailscale──>  minibox (docker)  ──>  AWS
                     mu6.es / www.mu6.es       100.105.44.45:8088              DynamoDB + S3
```

- **EC2 `EC2NAUX`** (`ssh EC2NAUX`, IP pública 32.193.246.214): edge. nginx termina
  TLS (Let's Encrypt/certbot) y hace `proxy_pass` a minibox por tailscale. Config del
  sitio: `/etc/nginx/sites-available/mu6` (→ `sites-enabled/mu6`). Cert en
  `/etc/letsencrypt/live/mu6.es/`. Renovación automática por certbot.
- **minibox** (`ssh minibox`, tailscale 100.105.44.45): corre el stack docker de Musix
  (y otras webs, cada una en su puerto). Musix expone **:8088** (Caddy interno → web + /api).
- **AWS**: DynamoDB single-table `musix_users` (us-east-1, con GSI1 y GSI3) + bucket S3 `mu6`.
- El código vive en `~/musix` en minibox (repo git, `origin` = GitHub).
  Los secretos están en `~/musix/.env` (NO versionado).

## Flujo de despliegue (de ahora en adelante)

1. **En local**: haz los cambios y pruébalos (`tsc --noEmit`, `vite build`, smoke del backend).
2. **Commit + push** a `main`:
   ```bash
   git add -A && git commit -m "..." && git push origin main
   ```
3. **Conéctate a minibox y actualiza**:
   ```bash
   ssh minibox
   cd ~/musix
   git pull --ff-only
   ```
4. **Re-deploy** (reconstruye solo lo que cambió):
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   O usa el helper: `./scripts/deploy.sh` (hace pull + build + up + health-check).
5. **Verifica** (ver "Smoke tests").

> Atajo: los pasos 3–5 están en `scripts/deploy.sh`. Desde minibox:
> `cd ~/musix && ./scripts/deploy.sh`.

## Smoke tests post-deploy

Desde minibox (local al stack):
```bash
curl -s http://localhost:8088/api/health           # {"status":"ok"}
curl -s http://localhost:8088/api/public-config     # claves públicas
```
Desde fuera (edge real):
```bash
curl -s https://mu6.es/api/health
```
Login admin (sin exponer credenciales):
```bash
U=$(grep ^ADMIN_USERNAME= .env|cut -d= -f2-); P=$(grep ^ADMIN_PASSWORD= .env|cut -d= -f2-)
curl -s https://mu6.es/api/auth/login --data-urlencode "username=$U" --data-urlencode "password=$P"
```
Logs: `docker compose -f docker-compose.prod.yml logs -f api`

## Notas importantes

### `vendor/` no está en el repo
El fork de AlphaTab (`vendor/`) **solo vive en local**. La web consume el artefacto
ya construido `apps/web/alphatab-fork.tgz` (ese sí versionado). Si tocas el fork:
1. Edita `vendor/alphatab/...` en local.
2. Reconstruye: `./scripts/build-alphatab-fork.sh` (regenera `apps/web/alphatab-fork.tgz`).
3. Commitea el `.tgz` y despliega normal.

### Red minibox ↔ GitHub
minibox sale por WiFi y la **descarga grande desde GitHub por HTTPS es lenta/inestable**
(un `git clone` completo puede fallar con "EOF temprano"). Por eso:
- El repo en minibox se **bootstrapeó por LAN** (rsync de un clon shallow), con `origin`
  apuntando a GitHub. Los `git pull` incrementales (deltas de KB) funcionan bien.
- Si un commit incluye un fichero **grande** (p. ej. regenerar `alphatab-fork.tgz`, ~4.5 MB),
  el `git pull` puede ir lento o atascarse. En ese caso, súbelo por LAN:
  ```bash
  # desde local
  rsync -az apps/web/alphatab-fork.tgz minibox:musix/apps/web/alphatab-fork.tgz
  ```
  y luego en minibox `git pull` (ya sin ese fichero pendiente) + rebuild.
- Re-bootstrap completo (si hiciera falta rehacer el repo), desde local:
  ```bash
  git clone --depth 1 "file://$PWD" /tmp/musix-shallow
  git -C /tmp/musix-shallow remote set-url origin https://github.com/GonzalezFJR/musix.git
  git -C /tmp/musix-shallow branch --set-upstream-to=origin/main main
  rsync -az --delete --exclude='.env' /tmp/musix-shallow/ minibox:musix/
  ```

### Secretos (`.env` en minibox)
- No se versiona. Vive en `~/musix/.env`.
- **Sin comillas envolventes** en los valores: `docker --env-file` las pasa literales
  (a diferencia de la interpolación de `${VAR}` de compose). P. ej. `S3_BUCKET_NAME=mu6`,
  no `S3_BUCKET_NAME="mu6"`.
- Variables propias de producción ya fijadas: `PUBLIC_BASE_URL=https://mu6.es`,
  `ALLOWED_ORIGINS=https://mu6.es,https://www.mu6.es`. `DYNAMODB_ENDPOINT_URL` lo fuerza a
  vacío `docker-compose.prod.yml` (usa AWS real).

### AWS
- Tabla y bucket ya existen. Para (re)crear o validar conectividad e índices:
  ```bash
  docker run --rm --env-file .env -v ~/musix/scripts:/s:ro python:3.12-slim \
    sh -c "pip install -q boto3 && python /s/init-aws-resources.py"
  ```
  El script es idempotente: crea tabla (pk/sk + GSI1 + GSI3 + TTL) y bucket si faltan.
- **Soundbanks**: el bucket debe tener `soundbanks/` para que el render MP3 tenga
  instrumentos. Subida inicial: `scripts/push-soundbanks-s3.sh`. Se sincronizan a local
  al arrancar el contenedor.

### nginx + certbot en la EC2 (referencia)
El sitio se creó copiando el patrón de las otras webs. Para un dominio nuevo:
```bash
# en EC2NAUX: config con proxy_pass http://100.105.44.45:<PUERTO>; luego:
sudo certbot --nginx -d <dominio> -d www.<dominio> --non-interactive --agree-tos --redirect
```
