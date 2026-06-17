from collections.abc import Generator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from .config import get_settings

settings = get_settings()

# check_same_thread sólo aplica a SQLite (desarrollo local).
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)


def init_db() -> None:
    # Importa los modelos para que SQLModel los registre antes de create_all.
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_columns()
    _migrate_legacy_scores()
    _ensure_admin_user()


# Micro-migración para desarrollo: create_all no añade columnas a tablas ya
# existentes. Añadimos las que falten sin perder datos.
def _ensure_columns() -> None:
    expected = {
        "project": {
            "description": "VARCHAR DEFAULT '' NOT NULL",
            "folder_id": "INTEGER",
            "has_score": "BOOLEAN DEFAULT 0 NOT NULL",
        },
        "user": {
            "role": "VARCHAR DEFAULT 'free' NOT NULL",
            "author_name": "VARCHAR DEFAULT '' NOT NULL",
            "first_name": "VARCHAR DEFAULT '' NOT NULL",
            "last_name": "VARCHAR DEFAULT '' NOT NULL",
            "location": "VARCHAR DEFAULT '' NOT NULL",
            "theme": "VARCHAR DEFAULT 'normal' NOT NULL",
            "preferences": "JSON DEFAULT '{}'",
        },
    }
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, cols in expected.items():
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in cols.items():
                if name not in present:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


# Migración suave: versiones anteriores guardaban el score JSON en la columna
# `project.score`. Ahora vive como `.mu6` en el almacenamiento. Si quedan datos
# en esa columna, los volcamos al almacenamiento la primera vez. Best-effort.
def _migrate_legacy_scores() -> None:
    inspector = inspect(engine)
    if "project" not in set(inspector.get_table_names()):
        return
    cols = {c["name"] for c in inspector.get_columns("project")}
    if "score" not in cols:
        return  # nada que migrar (esquema nuevo)

    import json

    from .storage import get_storage, score_key

    try:
        storage = get_storage()
    except Exception:
        return  # almacenamiento no disponible: no bloquear el arranque

    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT id, owner_id, score, has_score FROM project")
        ).fetchall()
        for pid, owner_id, score, has_score in rows:
            if has_score:
                continue
            if not score or score in ("{}", "null"):
                continue
            try:
                data = score if isinstance(score, (bytes, str)) else json.dumps(score)
                payload = data.encode() if isinstance(data, str) else data
                storage.put(score_key(owner_id, pid), payload)
                conn.execute(
                    text("UPDATE project SET has_score = 1 WHERE id = :id"), {"id": pid}
                )
            except Exception:
                continue  # no bloquear el arranque por un proyecto problemático


# Bootstrap del usuario admin a partir de ADMIN_EMAIL / ADMIN_PASSWORD.
def _ensure_admin_user() -> None:
    if not (settings.admin_email and settings.admin_password):
        return
    from .models import User
    from .security import hash_password

    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == settings.admin_email)).first()
        if user is None:
            user = User(
                email=settings.admin_email,
                hashed_password=hash_password(settings.admin_password),
                display_name="Admin",
                role="admin",
            )
            session.add(user)
        elif user.role != "admin":
            user.role = "admin"
            session.add(user)
        session.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
