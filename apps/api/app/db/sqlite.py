"""Backend de datos: SQLite (desarrollo local).

Implementación alternativa a DynamoDB para correr en local sin AWS. Cumple el
mismo `Repositories` Protocol (app/db/base.py) y replica la semántica observable
del backend DynamoDB (app/db/dynamo.py): unicidad de email, índice por google_sub,
contadores `project_count`/estadísticas, orden de listados y cursores opacos.

Toda la persistencia vive en un único fichero (`settings.sqlite_path`). El acceso
se serializa con un lock porque FastAPI ejecuta los endpoints síncronos en un pool
de hilos y `sqlite3` no comparte conexiones entre hilos con seguridad.
"""

from __future__ import annotations

import base64
import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..models import (
    ContactMessage,
    Folder,
    GlobalStats,
    LoginEvent,
    PasswordResetToken,
    Project,
    User,
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL,
    email_key     TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL DEFAULT '',
    display_name  TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'free',
    author_name   TEXT NOT NULL DEFAULT '',
    first_name    TEXT NOT NULL DEFAULT '',
    last_name     TEXT NOT NULL DEFAULT '',
    location      TEXT NOT NULL DEFAULT '',
    theme         TEXT NOT NULL DEFAULT 'normal',
    preferences   TEXT NOT NULL DEFAULT '{}',
    google_sub    TEXT UNIQUE,
    project_count INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    parent_id  TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id);
CREATE TABLE IF NOT EXISTS projects (
    id                TEXT PRIMARY KEY,
    owner_id          TEXT NOT NULL,
    folder_id         TEXT,
    title             TEXT NOT NULL DEFAULT '',
    artist            TEXT NOT NULL DEFAULT '',
    description       TEXT NOT NULL DEFAULT '',
    has_score         INTEGER NOT NULL DEFAULT 0,
    original_filename TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_folder ON projects(owner_id, folder_id);
CREATE TABLE IF NOT EXISTS login_events (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_user ON login_events(user_id);
CREATE TABLE IF NOT EXISTS reset_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    email      TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    subject    TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stats (
    pk            TEXT PRIMARY KEY,
    user_count    INTEGER NOT NULL DEFAULT 0,
    project_count INTEGER NOT NULL DEFAULT 0,
    users_admin   INTEGER NOT NULL DEFAULT 0,
    users_free    INTEGER NOT NULL DEFAULT 0,
    users_pro     INTEGER NOT NULL DEFAULT 0,
    users_invited INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO stats(pk) VALUES ('GLOBAL');
"""


# ── Helpers ──────────────────────────────────────────────────────
def _iso(dt) -> Optional[str]:
    return dt.isoformat() if isinstance(dt, datetime) else dt


def _dt(value):
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def _email_key(email: str) -> str:
    return email.strip().lower()


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(json.dumps({"o": offset}).encode()).decode()


def _decode_cursor(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        return int(json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())["o"])
    except Exception:  # noqa: BLE001 — cursor inválido → desde el principio
        return 0


# ── Repositorios ─────────────────────────────────────────────────
class _UserRepository:
    def __init__(self, db: "_Db"):
        self._db = db

    @staticmethod
    def _from_row(r: sqlite3.Row) -> User:
        prefs = r["preferences"]
        return User(
            id=r["id"],
            email=r["email"],
            hashed_password=r["hashed_password"] or "",
            display_name=r["display_name"] or "",
            role=r["role"] or "free",
            author_name=r["author_name"] or "",
            first_name=r["first_name"] or "",
            last_name=r["last_name"] or "",
            location=r["location"] or "",
            theme=r["theme"] or "normal",
            preferences=json.loads(prefs) if prefs else {},
            google_sub=r["google_sub"],
            project_count=int(r["project_count"] or 0),
            created_at=_dt(r["created_at"]),
        )

    @staticmethod
    def _params(u: User) -> dict:
        return {
            "id": u.id,
            "email": u.email,
            "email_key": _email_key(u.email),
            "hashed_password": u.hashed_password,
            "display_name": u.display_name,
            "role": u.role,
            "author_name": u.author_name,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "location": u.location,
            "theme": u.theme,
            "preferences": json.dumps(u.preferences or {}),
            "google_sub": u.google_sub,
            "project_count": int(u.project_count or 0),
            "created_at": _iso(u.created_at),
        }

    def get_by_id(self, user_id: str) -> Optional[User]:
        with self._db.lock:
            row = self._db.conn.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
        return self._from_row(row) if row else None

    def get_by_email(self, email: str) -> Optional[User]:
        with self._db.lock:
            row = self._db.conn.execute(
                "SELECT * FROM users WHERE email_key = ?", (_email_key(email),)
            ).fetchone()
        return self._from_row(row) if row else None

    def get_by_google_sub(self, sub: str) -> Optional[User]:
        with self._db.lock:
            row = self._db.conn.execute(
                "SELECT * FROM users WHERE google_sub = ?", (sub,)
            ).fetchone()
        return self._from_row(row) if row else None

    def create(self, user: User) -> User:
        params = self._params(user)
        with self._db.lock, self._db.conn:
            try:
                self._db.conn.execute(
                    """INSERT INTO users (id, email, email_key, hashed_password,
                        display_name, role, author_name, first_name, last_name,
                        location, theme, preferences, google_sub, project_count, created_at)
                       VALUES (:id, :email, :email_key, :hashed_password, :display_name,
                        :role, :author_name, :first_name, :last_name, :location, :theme,
                        :preferences, :google_sub, :project_count, :created_at)""",
                    params,
                )
            except sqlite3.IntegrityError as exc:
                # Unicidad de email (replica ValueError("email_exists") de DynamoDB).
                raise ValueError("email_exists") from exc
            self._db.bump(user_delta=1, role_deltas={user.role: 1})
        return user

    def update(self, user: User, *, previous_email: Optional[str] = None) -> User:
        params = self._params(user)
        with self._db.lock, self._db.conn:
            try:
                self._db.conn.execute(
                    """UPDATE users SET email=:email, email_key=:email_key,
                        hashed_password=:hashed_password, display_name=:display_name,
                        role=:role, author_name=:author_name, first_name=:first_name,
                        last_name=:last_name, location=:location, theme=:theme,
                        preferences=:preferences, google_sub=:google_sub,
                        project_count=:project_count, created_at=:created_at
                       WHERE id=:id""",
                    params,
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("email_exists") from exc
        return user

    def delete(self, user: User) -> None:
        with self._db.lock, self._db.conn:
            self._db.conn.execute("DELETE FROM projects WHERE owner_id = ?", (user.id,))
            self._db.conn.execute("DELETE FROM folders WHERE owner_id = ?", (user.id,))
            self._db.conn.execute("DELETE FROM login_events WHERE user_id = ?", (user.id,))
            self._db.conn.execute("DELETE FROM users WHERE id = ?", (user.id,))
            self._db.bump(
                user_delta=-1,
                project_delta=-int(user.project_count or 0),
                role_deltas={user.role: -1},
            )

    def list_all(
        self, limit: int = 50, cursor: Optional[str] = None
    ) -> tuple[list[User], Optional[str]]:
        offset = _decode_cursor(cursor)
        with self._db.lock:
            # Mismo orden que la GSI1 de DynamoDB: role, created_at, id.
            rows = self._db.conn.execute(
                "SELECT * FROM users ORDER BY role, created_at, id LIMIT ? OFFSET ?",
                (limit + 1, offset),
            ).fetchall()
        users = [self._from_row(r) for r in rows[:limit]]
        next_cursor = _encode_cursor(offset + limit) if len(rows) > limit else None
        return users, next_cursor


class _FolderRepository:
    def __init__(self, db: "_Db"):
        self._db = db

    @staticmethod
    def _from_row(r: sqlite3.Row) -> Folder:
        return Folder(
            id=r["id"],
            owner_id=r["owner_id"],
            name=r["name"] or "",
            parent_id=r["parent_id"],
            created_at=_dt(r["created_at"]),
        )

    def list_for_owner(self, owner_id: str) -> list[Folder]:
        with self._db.lock:
            rows = self._db.conn.execute(
                "SELECT * FROM folders WHERE owner_id = ?", (owner_id,)
            ).fetchall()
        folders = [self._from_row(r) for r in rows]
        folders.sort(key=lambda f: f.name.lower())
        return folders

    def get_owned(self, folder_id: str, owner_id: str) -> Optional[Folder]:
        with self._db.lock:
            row = self._db.conn.execute(
                "SELECT * FROM folders WHERE id = ? AND owner_id = ?",
                (folder_id, owner_id),
            ).fetchone()
        return self._from_row(row) if row else None

    def create(self, folder: Folder) -> Folder:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                "INSERT INTO folders (id, owner_id, name, parent_id, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (folder.id, folder.owner_id, folder.name, folder.parent_id, _iso(folder.created_at)),
            )
        return folder

    def update(self, folder: Folder) -> Folder:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                "UPDATE folders SET name = ?, parent_id = ? WHERE id = ? AND owner_id = ?",
                (folder.name, folder.parent_id, folder.id, folder.owner_id),
            )
        return folder

    def delete(self, folder: Folder) -> None:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                "DELETE FROM folders WHERE id = ? AND owner_id = ?",
                (folder.id, folder.owner_id),
            )


class _ProjectRepository:
    def __init__(self, db: "_Db"):
        self._db = db

    @staticmethod
    def _from_row(r: sqlite3.Row) -> Project:
        return Project(
            id=r["id"],
            owner_id=r["owner_id"],
            folder_id=r["folder_id"],
            title=r["title"] or "",
            artist=r["artist"] or "",
            description=r["description"] or "",
            has_score=bool(r["has_score"]),
            original_filename=r["original_filename"],
            created_at=_dt(r["created_at"]),
            updated_at=_dt(r["updated_at"]),
        )

    @staticmethod
    def _params(p: Project) -> tuple:
        return (
            p.id, p.owner_id, p.folder_id, p.title, p.artist, p.description,
            1 if p.has_score else 0, p.original_filename, _iso(p.created_at), _iso(p.updated_at),
        )

    def list_for_owner(self, owner_id: str) -> list[Project]:
        with self._db.lock:
            rows = self._db.conn.execute(
                "SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
                (owner_id,),
            ).fetchall()
        return [self._from_row(r) for r in rows]

    def get_owned(self, project_id: str, owner_id: str) -> Optional[Project]:
        with self._db.lock:
            row = self._db.conn.execute(
                "SELECT * FROM projects WHERE id = ? AND owner_id = ?",
                (project_id, owner_id),
            ).fetchone()
        return self._from_row(row) if row else None

    def create(self, project: Project) -> Project:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                """INSERT INTO projects (id, owner_id, folder_id, title, artist,
                    description, has_score, original_filename, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                self._params(project),
            )
            self._db.conn.execute(
                "UPDATE users SET project_count = project_count + 1 WHERE id = ?",
                (project.owner_id,),
            )
            self._db.bump(project_delta=1)
        return project

    def update(self, project: Project) -> Project:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                """UPDATE projects SET folder_id = ?, title = ?, artist = ?,
                    description = ?, has_score = ?, original_filename = ?, updated_at = ?
                   WHERE id = ? AND owner_id = ?""",
                (
                    project.folder_id, project.title, project.artist, project.description,
                    1 if project.has_score else 0, project.original_filename,
                    _iso(project.updated_at), project.id, project.owner_id,
                ),
            )
        return project

    def delete(self, project: Project) -> None:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                "DELETE FROM projects WHERE id = ? AND owner_id = ?",
                (project.id, project.owner_id),
            )
            self._db.conn.execute(
                "UPDATE users SET project_count = project_count - 1 WHERE id = ?",
                (project.owner_id,),
            )
            self._db.bump(project_delta=-1)

    def reassign_folder(
        self, from_folder_id: str, to_folder_id: Optional[str], owner_id: str
    ) -> None:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                "UPDATE projects SET folder_id = ? WHERE owner_id = ? AND folder_id = ?",
                (to_folder_id, owner_id, from_folder_id),
            )


class _EventRepository:
    def __init__(self, db: "_Db"):
        self._db = db

    @staticmethod
    def _from_row(r: sqlite3.Row) -> LoginEvent:
        return LoginEvent(
            id=r["id"],
            user_id=r["user_id"],
            email=r["email"] or "",
            created_at=_dt(r["created_at"]),
        )

    def record_login(self, event: LoginEvent) -> None:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                "INSERT INTO login_events (id, user_id, email, created_at) VALUES (?, ?, ?, ?)",
                (event.id, event.user_id, event.email, _iso(event.created_at)),
            )

    def last_login_for(self, user_id: str) -> Optional[LoginEvent]:
        with self._db.lock:
            row = self._db.conn.execute(
                "SELECT * FROM login_events WHERE user_id = ? ORDER BY id DESC LIMIT 1",
                (user_id,),
            ).fetchone()
        return self._from_row(row) if row else None

    def recent_logins(self, limit: int = 20) -> list[LoginEvent]:
        with self._db.lock:
            rows = self._db.conn.execute(
                "SELECT * FROM login_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._from_row(r) for r in rows]


class _ResetTokenRepository:
    def __init__(self, db: "_Db"):
        self._db = db

    def create(self, token: PasswordResetToken) -> None:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                "INSERT OR REPLACE INTO reset_tokens (token, user_id, email, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (token.token, token.user_id, token.email, _iso(token.expires_at)),
            )

    def get(self, token: str) -> Optional[PasswordResetToken]:
        with self._db.lock:
            row = self._db.conn.execute(
                "SELECT * FROM reset_tokens WHERE token = ?", (token,)
            ).fetchone()
        if not row:
            return None
        return PasswordResetToken(
            token=row["token"], user_id=row["user_id"], email=row["email"],
            expires_at=_dt(row["expires_at"]),
        )

    def delete(self, token: str) -> None:
        with self._db.lock, self._db.conn:
            self._db.conn.execute("DELETE FROM reset_tokens WHERE token = ?", (token,))


class _ContactRepository:
    def __init__(self, db: "_Db"):
        self._db = db

    def create(self, message: ContactMessage) -> ContactMessage:
        with self._db.lock, self._db.conn:
            self._db.conn.execute(
                "INSERT INTO contacts (id, name, email, subject, body, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (message.id, message.name, message.email, message.subject,
                 message.body, _iso(message.created_at)),
            )
        return message

    def list_recent(
        self, limit: int = 50, cursor: Optional[str] = None
    ) -> tuple[list[ContactMessage], Optional[str]]:
        offset = _decode_cursor(cursor)
        with self._db.lock:
            rows = self._db.conn.execute(
                "SELECT * FROM contacts ORDER BY id DESC LIMIT ? OFFSET ?",
                (limit + 1, offset),
            ).fetchall()
        msgs = [
            ContactMessage(
                id=r["id"], name=r["name"], email=r["email"],
                subject=r["subject"] or "", body=r["body"] or "",
                created_at=_dt(r["created_at"]),
            )
            for r in rows[:limit]
        ]
        next_cursor = _encode_cursor(offset + limit) if len(rows) > limit else None
        return msgs, next_cursor


class _StatsRepository:
    def __init__(self, db: "_Db"):
        self._db = db

    def bump(
        self, user_delta: int = 0, project_delta: int = 0,
        role_deltas: Optional[dict[str, int]] = None,
    ) -> None:
        with self._db.lock, self._db.conn:
            self._db.bump(user_delta=user_delta, project_delta=project_delta, role_deltas=role_deltas)

    def get(self) -> GlobalStats:
        with self._db.lock:
            row = self._db.conn.execute("SELECT * FROM stats WHERE pk = 'GLOBAL'").fetchone()
        if not row:
            return GlobalStats()
        return GlobalStats(
            user_count=int(row["user_count"] or 0),
            project_count=int(row["project_count"] or 0),
            users_admin=int(row["users_admin"] or 0),
            users_free=int(row["users_free"] or 0),
            users_pro=int(row["users_pro"] or 0),
            users_invited=int(row["users_invited"] or 0),
        )

    def recompute(self) -> GlobalStats:
        with self._db.lock, self._db.conn:
            stats = GlobalStats()
            for role, count in self._db.conn.execute(
                "SELECT role, COUNT(*) AS c FROM users GROUP BY role"
            ).fetchall():
                stats.user_count += count
                attr = f"users_{role}"
                if hasattr(stats, attr):
                    setattr(stats, attr, getattr(stats, attr) + count)
            stats.project_count = self._db.conn.execute(
                "SELECT COUNT(*) FROM projects"
            ).fetchone()[0]
            self._db.conn.execute(
                """UPDATE stats SET user_count = ?, project_count = ?, users_admin = ?,
                    users_free = ?, users_pro = ?, users_invited = ? WHERE pk = 'GLOBAL'""",
                (stats.user_count, stats.project_count, stats.users_admin,
                 stats.users_free, stats.users_pro, stats.users_invited),
            )
        return stats


# ── Conexión / contenedor ────────────────────────────────────────
class _Db:
    """Conexión SQLite compartida + lock. `bump` actualiza contadores agregados.

    Los métodos `bump` y `recompute` asumen que el caller ya tiene el lock y una
    transacción abierta (se invocan dentro de `with self._db.lock, self._db.conn`).
    """

    # Sufijos válidos de columna por rol (defensa frente a roles inesperados).
    _ROLE_COLUMNS = {"admin", "free", "pro", "invited"}

    def __init__(self, path: Path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.lock = threading.Lock()
        with self.conn:
            self.conn.executescript(_SCHEMA)

    def bump(
        self, user_delta: int = 0, project_delta: int = 0,
        role_deltas: Optional[dict[str, int]] = None,
    ) -> None:
        sets, params = [], []
        if user_delta:
            sets.append("user_count = user_count + ?")
            params.append(user_delta)
        if project_delta:
            sets.append("project_count = project_count + ?")
            params.append(project_delta)
        for role, delta in (role_deltas or {}).items():
            if not delta or role not in self._ROLE_COLUMNS:
                continue
            sets.append(f"users_{role} = users_{role} + ?")
            params.append(delta)
        if not sets:
            return
        self.conn.execute(
            f"UPDATE stats SET {', '.join(sets)} WHERE pk = 'GLOBAL'", params
        )


class SqliteRepositories:
    """Implementación de `Repositories` (app/db/base.py) sobre SQLite."""

    def __init__(self, path: Path) -> None:
        db = _Db(path)
        self.users = _UserRepository(db)
        self.folders = _FolderRepository(db)
        self.projects = _ProjectRepository(db)
        self.events = _EventRepository(db)
        self.reset_tokens = _ResetTokenRepository(db)
        self.contacts = _ContactRepository(db)
        self.stats = _StatsRepository(db)
