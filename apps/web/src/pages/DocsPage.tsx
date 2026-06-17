import { Link } from "react-router-dom";

// Resumen técnico del proyecto. Ruta protegida: solo accesible por admin loggueado
// (ver guard AdminProtected en App.tsx). En dev el usuario fijo tiene rol admin.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mb-5 p-6">
      <h2 className="mb-3 text-lg font-semibold text-white">{title}</h2>
      <div className="space-y-2 text-sm text-slate-300">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-44 shrink-0 text-slate-500">{k}</span>
      <span className="text-slate-300">{v}</span>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Documentación técnica</h1>
          <p className="text-sm text-slate-400">Resumen del proyecto Musix · solo administradores</p>
        </div>
        <Link to="/" className="btn-ghost">
          ← Volver
        </Link>
      </header>

      <Section title="Arquitectura">
        <p>
          El trabajo pesado (render de partituras, audio, edición) ocurre en el navegador vía
          AlphaTab. El backend es CRUD + autenticación + conversión de formatos + persistencia.
        </p>
        <pre className="mt-2 overflow-auto rounded-md bg-ink-900 p-3 text-xs text-slate-400">{`Navegador (React + AlphaTab)  ── render SVG + audio MIDI en el cliente
        │  REST/JSON (JWT)
FastAPI (Python)              ── auth, carpetas, proyectos, import/export
        │
Metadatos (SQL / DynamoDB-ready)  +  Ficheros (.mu6) en disco o S3`}</pre>
      </Section>

      <Section title="Stack">
        <Row k="Frontend" v="React 18 + TypeScript + Vite + TailwindCSS + AlphaTab (fork)" />
        <Row k="Backend" v="Python 3.11+ · FastAPI · SQLModel · PyGuitarPro · Argon2 · PyJWT" />
        <Row k="Metadatos" v="SQLite (dev) / Postgres (docker); capa de repositorio lista para DynamoDB" />
        <Row k="Ficheros" v="Almacenamiento local (dev) o S3 / S3-compatible (boto3)" />
        <Row k="Infra" v="Docker Compose + Caddy (HTTPS automático)" />
      </Section>

      <Section title="Módulos del backend">
        <Row k="app/config.py" v="Settings (env): storage/db backend, S3, DynamoDB, admin, JWT" />
        <Row k="app/storage/" v="StorageBackend (ABC) + LocalStorage + S3Storage + factory" />
        <Row k="app/db/" v="Repositorios: base (Protocol), sql (real), dynamo (stub), factory" />
        <Row k="app/models.py" v="User, Folder, Project (tabla ligera); ROLES, THEMES" />
        <Row k="app/routers/" v="auth, folders, projects, render, instruments" />
        <Row k="app/database.py" v="init_db: create_all + micro-migración + bootstrap admin" />
      </Section>

      <Section title="Modelo de datos">
        <p className="text-slate-400">Tablas ligeras; lo &quot;gordo&quot; (el score) va a ficheros .mu6.</p>
        <Row k="User" v="email, hashed_password, role, perfil (autor/nombre/ubicación), theme, preferences" />
        <Row k="Folder" v="owner_id, name, parent_id (subcarpetas), created_at" />
        <Row k="Project" v="owner_id, folder_id, title, artist, description, has_score, original_filename" />
        <p className="mt-2 text-slate-400">DynamoDB previsto (ver app/db/dynamo.py):</p>
        <Row k="musix_users" v="PK USER#email · SK PROFILE · GSI por id" />
        <Row k="musix_projects" v="PK USER#owner_id · SK PROJECT#id · GSI por folder_id" />
        <Row k="musix_folders" v="PK USER#owner_id · SK FOLDER#id" />
      </Section>

      <Section title="Almacenamiento de ficheros">
        <p>Claves por usuario y proyecto, idénticas en local y S3:</p>
        <pre className="mt-1 overflow-auto rounded-md bg-ink-900 p-3 text-xs text-slate-400">{`users/{user_id}/projects/{project_id}/score.mu6
users/{user_id}/projects/{project_id}/original{ext}`}</pre>
        <p className="mt-1">
          Backend seleccionable con <code>STORAGE_BACKEND</code> (local | s3). Local por defecto en
          dev; S3 requiere el extra <code>boto3</code>.
        </p>
      </Section>

      <Section title="Roles de usuario">
        <Row k="admin" v="Acceso total + esta vista /docs + render de audio" />
        <Row k="free" v="Cuenta gratuita (rol por defecto). Cambia instrumentos General MIDI (reproducción en el navegador); sin export MP3 ni instrumentos SFZ." />
        <Row k="pro" v="Cuenta de pago: añade export a MP3 e instrumentos SFZ (render del servidor)." />
        <Row k="invited" v="Invitado / colaborador limitado (placeholder)" />
        <p className="mt-1 text-slate-400">
          Admin inicial vía <code>ADMIN_EMAIL</code> / <code>ADMIN_PASSWORD</code>. En dev, el
          usuario fijo es admin.
        </p>
      </Section>

      <Section title="Theming">
        <p>
          Tres modos (claro / normal / oscuro) mediante variables CSS por <code>data-theme</code> en
          <code> &lt;html&gt;</code>. Tailwind consume esas variables (ink/accent/slate), así que el
          markup existente se adapta sin cambios. La partitura de AlphaTab ajusta sus colores de
          notación y el fondo del lienzo según el tema.
        </p>
      </Section>

      <Section title="Consumo de recursos (CPU / memoria)">
        <p>
          El grueso del trabajo (render de partituras, audio MIDI, edición) corre en el
          navegador del cliente. El backend es ligero salvo en dos operaciones puntuales:
        </p>
        <Row
          k="Render de audio"
          v="Lo único intensivo. /api/render/mp3 lanza subprocesos: FluidSynth (SF2→WAV) o sfizz_render (SFZ→WAV) por pista + ffmpeg (mezcla→MP3). CPU-bound y a ráfagas."
        />
        <Row
          k="↳ CPU"
          v="Cada motor satura ~1 núcleo mientras dura. Hasta 32 pistas (MAX_TRACKS) procesadas en serie; varios renders concurrentes multiplican el uso."
        />
        <Row
          k="↳ Memoria"
          v="sfizz carga los samples SFZ en RAM (cientos de MB por instrumento); FluidSynth mapea el SF2. Pico de ~0,5–1 GB por render SFZ activo."
        />
        <Row
          k="↳ Límites"
          v="MIDI ≤ 8 MB/pista, timeout de 240 s por subproceso. Ficheros temporales en disco (tmp), borrados al terminar."
        />
        <Row
          k="↳ Acceso"
          v="Reservado a cuentas Pro/admin (endpoints /api/render y /api/instruments). Los instrumentos General MIDI se reproducen en el navegador (AlphaSynth) y los usa cualquiera; solo SFZ y el export MP3 tocan el servidor."
        />
        <Row
          k="Hash de contraseñas"
          v="Argon2 (login/registro) es memory-hard por diseño: ~64 MiB y un pico de CPU por hash. Puntual, solo en autenticación."
        />
        <Row k="API en reposo (CRUD/JSON)" v="Trivial: I/O ligado a DB y disco/S3, sin cómputo pesado." />
        <Row k="Postgres" v="Tablas ligeras (usuarios, carpetas, proyectos); el score va a ficheros, no a la DB. Consumo bajo." />
        <Row k="Caddy + web estática" v="Proxy inverso + assets servidos; coste despreciable." />
        <Row
          k="Disco"
          v="Soundbanks ~757 MB (39 MB SF2 + 719 MB SFZ, bind-mount solo lectura) + imagen + volumen de ficheros .mu6 (crece con el uso, ligero) + datos de Postgres."
        />
      </Section>

      <Section title="Requisitos de despliegue recomendados">
        <p>
          Pensado para un VPS modesto: el cliente asume el render visual y el audio de
          reproducción; el servidor solo materializa la exportación a MP3.
        </p>
        <Row k="Mínimo (MVP / poca carga)" v="2 vCPU · 4 GB RAM · ~5 GB disco. Suficiente para uso individual y renders esporádicos." />
        <Row k="Aconsejable (varios usuarios)" v="4 vCPU · 8 GB RAM · 10–20 GB disco SSD, para absorber renders concurrentes sin colas largas." />
        <Row k="Cuello de botella" v="El render concurrente: cada job ocupa ~1 núcleo y RAM por samples. Dimensionar vCPU según renders simultáneos esperados." />
        <Row k="Escalado" v="El render es idealmente separable a un servicio/worker aparte con sus propios límites de recursos (ver docs/AUDIO_EXPORT.md)." />
        <Row k="Dependencias nativas" v="La imagen api incluye fluidsynth y ffmpeg (apt) y compila sfizz_render desde fuente; los soundbanks se montan desde el host." />
        <Row k="Servicios (docker-compose)" v="db (Postgres), api (FastAPI/uvicorn + render), web (estática) y caddy (HTTPS automático)." />
        <p className="mt-2 text-slate-400">
          Para producción con carga real conviene fijar límites por contenedor
          (<code>deploy.resources</code>) y, si crecen los renders, acotar la concurrencia
          (cola / nº de workers) para no agotar CPU y RAM.
        </p>
      </Section>

      <Section title="Variables de entorno clave">
        <Row k="STORAGE_BACKEND" v="local | s3 (+ S3_BUCKET, S3_REGION, S3_ENDPOINT_URL, AWS_*)" />
        <Row k="DB_BACKEND" v="sql | dynamodb (+ DYNAMODB_*)" />
        <Row k="AUTH_DISABLED" v="true en dev (usuario fijo admin); false en producción" />
        <Row k="LANDING_ENABLED" v="false en dev; true en producción" />
        <Row k="ADMIN_EMAIL / ADMIN_PASSWORD" v="Crea/asegura el usuario admin al arrancar" />
      </Section>
    </div>
  );
}
