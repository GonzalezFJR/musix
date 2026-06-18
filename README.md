# Musix

Editor de partituras y tablatura multipista basado en web — una alternativa moderna,
elegante y autoalojable al estilo "Guitar Pro", servible en web pública con login.

> "Guitar Pro" es una marca registrada de Arobas Music. Musix no está afiliado a Arobas
> Music. Musix puede **importar** ficheros que poseas (`.gp3/.gp4/.gp5/.gpx/.gp`, MuseScore
> `.mscz`/`.mscx`, MusicXML) y **exportar** a Guitar Pro (`.gp`) y MuseScore 4 (`.mscz`)
> mediante librerías de código abierto.

## Arquitectura

```
Navegador (React + AlphaTab)  ── render SVG + audio MIDI (SoundFont) en el cliente
        │  REST/JSON (JWT)
FastAPI (Python)              ── auth, usuarios/roles, carpetas, proyectos, import/export
        │                        ├─ Metadatos: capa de repositorio  → SQL (dev) | DynamoDB (prod)
        │                        └─ Ficheros (.mu6, originales)    → disco (dev) | S3 (prod)
Caddy ── HTTPS automático + reverse proxy
```

El trabajo pesado (renderizado de partituras, reproducción de audio, edición) ocurre
**en el navegador** gracias a [AlphaTab](https://github.com/CoderLine/alphaTab). El backend
es principalmente CRUD + autenticación + conversión de formatos, por lo que los requisitos
de servidor son modestos (un VPS de 2 vCPU / 4 GB RAM basta para el MVP).

## Stack

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS + AlphaTab + React Router
- **Backend:** Python 3.12 + FastAPI + SQLModel + PyGuitarPro + Argon2
- **Metadatos:** capa de repositorio (`app/db/`) — SQL (SQLite dev / Postgres) y adaptador
  DynamoDB preparado para producción (stub).
- **Ficheros:** capa de almacenamiento (`app/storage/`) — disco (dev) o S3 / S3-compatible
  (`boto3`, extra `s3`). Los proyectos guardan su score como `.mu6`; la BD solo lleva
  metadatos ligeros.
- **Infra:** Docker Compose + Caddy (reverse proxy con HTTPS automático)

## Funcionalidades de plataforma

- **Dashboard con carpetas:** directorios/subdirectorios por usuario; arrastra proyectos a
  carpetas (drag & drop). Botón "Nuevo proyecto" en la barra superior.
- **Usuarios y roles:** registro con email+contraseña y perfil opcional (autor,
  nombre/apellidos, ubicación). Roles `admin | free | pro | invited` (declarados). Admin
  inicial vía `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- **Temas:** claro / normal / oscuro (el oscuro lleva también la partitura a fondo oscuro);
  se elige en **Ajustes** y se guarda en el perfil.
- **/docs:** resumen técnico del proyecto, accesible solo para administradores autenticados.
- **Landing + login:** placeholder, desactivado en dev (`LANDING_ENABLED`); se activa en
  producción.

## Variables de entorno

Ver [`.env.example`](.env.example). Las principales nuevas:

| Variable | Por defecto | Para qué |
|---|---|---|
| `STORAGE_BACKEND` | `local` | `local` (disco) o `s3`. |
| `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT_URL` / `S3_PREFIX` | — | Bucket S3 / S3-compatible (MinIO). |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | Credenciales S3. |
| `DB_BACKEND` | `sql` | `sql` (SQLModel) o `dynamodb` (stub). |
| `DYNAMODB_REGION` / `DYNAMODB_ENDPOINT_URL` / `DYNAMODB_TABLE_PREFIX` | — | DynamoDB (prod). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Crea/asegura un usuario admin al arrancar. |
| `LANDING_ENABLED` | `false` | Activa la landing pública (producción). |

## Arranque rápido (Ubuntu)

```bash
./setup.sh           # instala Docker si falta, genera .env con secretos, y levanta todo
```

Luego abre `http://localhost`. Para producción con HTTPS, pon tu dominio en `SITE_ADDRESS`
(ej. `musix.midominio.com`) y un email en `ACME_EMAIL` dentro de `.env`, y vuelve a
ejecutar `./setup.sh` — Caddy obtiene el certificado Let's Encrypt automáticamente.

### Despliegue LOCAL (SQLite + disco, sin AWS, sin login)

Para correr todo en local sin DynamoDB ni S3 y sin pantalla de login (se entra
directo como admin), usa el compose de desarrollo:

```bash
docker compose -f docker-compose.dev.yml up --build
# → http://localhost  (entra directo como admin, sin login)
```

Esto levanta `api` + `web` + `caddy` con:

- **Metadatos en SQLite** (`DB_BACKEND=sqlite`) — un fichero en el volumen `dev-data`.
- **Ficheros en disco local** (`S3_BUCKET_NAME` vacío) — mismo volumen.
- **Sin autenticación** (`AUTH_DISABLED=true`, `ALLOW_REGISTRATION=false`): toda
  petición entra como el usuario admin `admin@local`.

⚠️ No hay autenticación: **no usar esta configuración en producción.** El despliegue
de producción sigue siendo `docker-compose.yml` (DynamoDB + S3 + login).

### Desarrollo (sin Docker para iterar rápido)

```bash
# Backend (SQLite local + login desactivado)
cd apps/api && python -m venv .venv && source .venv/bin/activate
pip install -e .
DB_BACKEND=sqlite SQLITE_PATH=./musix.db AUTH_DISABLED=true \
  ALLOW_REGISTRATION=false S3_BUCKET_NAME= FILES_DIR=./data/files \
  uvicorn app.main:app --reload

# Frontend
cd apps/web && npm install && npm run dev
```

## Estructura

```
musix/
├── apps/
│   ├── api/          # Backend FastAPI
│   │   └── app/
│   │       ├── routers/   # auth, folders, projects, render, instruments
│   │       ├── storage/   # StorageBackend: local + S3
│   │       └── db/        # repositorios: SQL (real) + DynamoDB (stub)
│   └── web/          # Frontend React
│       └── src/
│           ├── theme/     # ThemeContext (claro/normal/oscuro)
│           └── pages/     # Dashboard, Editor, Settings, Login, Landing, Docs
├── docker-compose.yml
├── Caddyfile         # Reverse proxy + HTTPS
├── setup.sh          # Script maestro (Ubuntu)
└── .env.example
```

## Créditos

Musix usa un **fork de [AlphaTab](https://github.com/CoderLine/alphaTab)** (MPL-2.0) para el
renderizado de partituras, la reproducción MIDI y la base del editor. Agradecemos a Daniel
Kuschny y a los contribuidores de AlphaTab. Nuestras modificaciones se mantienen bajo MPL-2.0
en [`vendor/alphatab`](vendor/alphatab) — ver [docs/FORK.md](docs/FORK.md).

## Notas técnicas

- **Assets autoalojados:** las fuentes musicales (Bravura, SIL OFL) y el SoundFont
  (`sonivox.sf2`) se copian desde `@coderline/alphatab` a `/assets/alphatab/` en build
  (`vite-plugin-static-copy`). Sin dependencias de CDN externo.
- **Carga protegida:** AlphaTab no envía cabeceras de auth, así que el cliente descarga el
  fichero original como `ArrayBuffer` (con el JWT) y lo pasa al visor por bytes.
- **Verificado:** backend probado de extremo a extremo (registro/login/CRUD/gating) sobre
  SQLite; frontend compila y empaqueta los assets correctamente.

## ⚠️ Login desactivado (modo desarrollo)

Con `AUTH_DISABLED=true` (activo en `docker-compose.dev.yml`), la API trata toda
petición como el usuario admin sembrado `ADMIN_USERNAME` (por defecto `admin@local`,
rol `admin`, así `/docs` y `/adminpanel` son accesibles) y el frontend entra directo
sin pantalla de login. El registro queda deshabilitado (`ALLOW_REGISTRATION=false`).
El despliegue de producción (`docker-compose.yml`) deja `AUTH_DISABLED` sin definir,
por lo que el login con JWT funciona con normalidad.

## Estado

Andamiaje inicial **verificado**: proyectos + visor/editor AlphaTab con reproducción,
cursor de compás/beat e interacción por clic. Importación de Guitar Pro, MuseScore
(`.mscz`/`.mscx`), MusicXML y Capella; exportación a Guitar Pro (`.gp`), MuseScore 4
(`.mscz`), MIDI, PDF y al formato propio Musix (`.mu6`). Login implementado pero
desactivado en dev.
