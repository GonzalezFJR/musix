"""Backend de datos: DynamoDB single-table.

Una sola tabla (`settings.dynamodb_table`) con clave compuesta pk/sk y dos GSI:

  GSI1 (gsi1pk, gsi1sk): listar usuarios para admin (gsi1pk="USERS") y logins
                          recientes globales (gsi1pk="LOGINS").
  GSI3 (gsi3pk, gsi3sk): proyectos por carpeta (sparse) → reassign_folder.

Tipos de item (atributo `type`):
  user            pk=USER#{id}            sk=PROFILE
  email_index     pk=EMAIL#{email}        sk=EMAIL        → user_id (unicidad email)
  google_index    pk=GOOGLE#{sub}         sk=GOOGLE       → user_id
  folder          pk=USER#{owner}         sk=FOLDER#{id}
  project         pk=USER#{owner}         sk=PROJECT#{id}
  login_event     pk=USER#{uid}           sk=LOGIN#{ulid}
  reset_token     pk=RESET#{token}        sk=RESET        (TTL nativo)
  contact         pk=CONTACT              sk=MSG#{ulid}
  stats           pk=STATS                sk=GLOBAL       (contadores ADD)
"""

from __future__ import annotations

import base64
import json
from datetime import datetime
from decimal import Decimal
from functools import lru_cache
from typing import Optional

from boto3.dynamodb.conditions import Attr, Key

from ..config import get_settings
from ..models import (
    ContactMessage,
    Folder,
    GlobalStats,
    LoginEvent,
    PasswordResetToken,
    Project,
    User,
)


# ── Cliente / tabla ──────────────────────────────────────────────
@lru_cache
def _table():
    import boto3

    s = get_settings()
    kwargs: dict = {"region_name": s.aws_region}
    if s.dynamodb_endpoint_url:
        kwargs["endpoint_url"] = s.dynamodb_endpoint_url
    # DynamoDB Local exige credenciales aunque las ignore; usamos dummies si faltan.
    kwargs["aws_access_key_id"] = s.aws_access_key or "local"
    kwargs["aws_secret_access_key"] = s.aws_secret_key or "local"
    resource = boto3.resource("dynamodb", **kwargs)
    return resource.Table(s.dynamodb_table)


# ── Helpers de (de)serialización ─────────────────────────────────
def _iso(dt) -> Optional[str]:
    return dt.isoformat() if isinstance(dt, datetime) else dt


def _dt(value):
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def _int(value) -> int:
    if isinstance(value, (Decimal, float, int)):
        return int(value)
    return 0


def _email_key(email: str) -> str:
    return email.strip().lower()


# ── User ─────────────────────────────────────────────────────────
def _user_item(u: User) -> dict:
    item = {
        "pk": f"USER#{u.id}",
        "sk": "PROFILE",
        "type": "user",
        "gsi1pk": "USERS",
        "gsi1sk": f"{u.role}#{_iso(u.created_at)}#{u.id}",
        "id": u.id,
        "email": u.email,
        "hashed_password": u.hashed_password,
        "display_name": u.display_name,
        "role": u.role,
        "author_name": u.author_name,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "location": u.location,
        "theme": u.theme,
        "preferences": json.dumps(u.preferences or {}),
        "project_count": int(u.project_count or 0),
        "created_at": _iso(u.created_at),
    }
    if u.google_sub:
        item["google_sub"] = u.google_sub
    return item


def _user_from_item(it: dict) -> User:
    prefs = it.get("preferences")
    return User(
        id=it["id"],
        email=it["email"],
        hashed_password=it.get("hashed_password", ""),
        display_name=it.get("display_name", ""),
        role=it.get("role", "free"),
        author_name=it.get("author_name", ""),
        first_name=it.get("first_name", ""),
        last_name=it.get("last_name", ""),
        location=it.get("location", ""),
        theme=it.get("theme", "normal"),
        preferences=json.loads(prefs) if isinstance(prefs, str) else (prefs or {}),
        google_sub=it.get("google_sub"),
        project_count=_int(it.get("project_count", 0)),
        created_at=_dt(it.get("created_at")),
    )


class _DynamoUserRepository:
    def __init__(self, table):
        self._t = table

    def get_by_id(self, user_id: str) -> Optional[User]:
        resp = self._t.get_item(Key={"pk": f"USER#{user_id}", "sk": "PROFILE"})
        item = resp.get("Item")
        return _user_from_item(item) if item else None

    def _resolve_index(self, pk: str, sk: str) -> Optional[User]:
        resp = self._t.get_item(Key={"pk": pk, "sk": sk})
        item = resp.get("Item")
        if not item:
            return None
        return self.get_by_id(item["user_id"])

    def get_by_email(self, email: str) -> Optional[User]:
        return self._resolve_index(f"EMAIL#{_email_key(email)}", "EMAIL")

    def get_by_google_sub(self, sub: str) -> Optional[User]:
        return self._resolve_index(f"GOOGLE#{sub}", "GOOGLE")

    def create(self, user: User) -> User:
        email_pk = f"EMAIL#{_email_key(user.email)}"
        # El item-índice de email garantiza unicidad de forma atómica.
        try:
            self._t.put_item(
                Item={"pk": email_pk, "sk": "EMAIL", "type": "email_index", "user_id": user.id, "email": user.email},
                ConditionExpression=Attr("pk").not_exists(),
            )
        except self._t.meta.client.exceptions.ConditionalCheckFailedException as exc:
            raise ValueError("email_exists") from exc

        self._t.put_item(Item=_user_item(user))
        if user.google_sub:
            self._t.put_item(
                Item={"pk": f"GOOGLE#{user.google_sub}", "sk": "GOOGLE", "type": "google_index", "user_id": user.id, "email": user.email}
            )
        _stats_bump(self._t, user_delta=1, role_deltas={user.role: 1})
        return user

    def update(self, user: User, *, previous_email: Optional[str] = None) -> User:
        if previous_email and _email_key(previous_email) != _email_key(user.email):
            new_pk = f"EMAIL#{_email_key(user.email)}"
            try:
                self._t.put_item(
                    Item={"pk": new_pk, "sk": "EMAIL", "type": "email_index", "user_id": user.id, "email": user.email},
                    ConditionExpression=Attr("pk").not_exists(),
                )
            except self._t.meta.client.exceptions.ConditionalCheckFailedException as exc:
                raise ValueError("email_exists") from exc
            self._t.delete_item(Key={"pk": f"EMAIL#{_email_key(previous_email)}", "sk": "EMAIL"})
        self._t.put_item(Item=_user_item(user))
        if user.google_sub:
            self._t.put_item(
                Item={"pk": f"GOOGLE#{user.google_sub}", "sk": "GOOGLE", "type": "google_index", "user_id": user.id, "email": user.email}
            )
        return user

    def delete(self, user: User) -> None:
        # Borra todos los items bajo USER#{id} (perfil, carpetas, proyectos, logins).
        resp = self._t.query(KeyConditionExpression=Key("pk").eq(f"USER#{user.id}"))
        with self._t.batch_writer() as batch:
            for it in resp.get("Items", []):
                batch.delete_item(Key={"pk": it["pk"], "sk": it["sk"]})
        self._t.delete_item(Key={"pk": f"EMAIL#{_email_key(user.email)}", "sk": "EMAIL"})
        if user.google_sub:
            self._t.delete_item(Key={"pk": f"GOOGLE#{user.google_sub}", "sk": "GOOGLE"})
        _stats_bump(
            self._t,
            user_delta=-1,
            project_delta=-int(user.project_count or 0),
            role_deltas={user.role: -1},
        )

    def list_all(self, limit: int = 50, cursor: Optional[str] = None) -> tuple[list[User], Optional[str]]:
        kwargs: dict = {
            "IndexName": "GSI1",
            "KeyConditionExpression": Key("gsi1pk").eq("USERS"),
            "Limit": limit,
        }
        if cursor:
            kwargs["ExclusiveStartKey"] = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        resp = self._t.query(**kwargs)
        users = [_user_from_item(it) for it in resp.get("Items", [])]
        last = resp.get("LastEvaluatedKey")
        next_cursor = base64.urlsafe_b64encode(json.dumps(last).encode()).decode() if last else None
        return users, next_cursor


# ── Folder ───────────────────────────────────────────────────────
def _folder_item(f: Folder) -> dict:
    item = {
        "pk": f"USER#{f.owner_id}",
        "sk": f"FOLDER#{f.id}",
        "type": "folder",
        "id": f.id,
        "owner_id": f.owner_id,
        "name": f.name,
        "created_at": _iso(f.created_at),
    }
    if f.parent_id:
        item["parent_id"] = f.parent_id
    return item


def _folder_from_item(it: dict) -> Folder:
    return Folder(
        id=it["id"],
        owner_id=it["owner_id"],
        name=it.get("name", ""),
        parent_id=it.get("parent_id"),
        created_at=_dt(it.get("created_at")),
    )


class _DynamoFolderRepository:
    def __init__(self, table):
        self._t = table

    def list_for_owner(self, owner_id: str) -> list[Folder]:
        resp = self._t.query(
            KeyConditionExpression=Key("pk").eq(f"USER#{owner_id}") & Key("sk").begins_with("FOLDER#")
        )
        folders = [_folder_from_item(it) for it in resp.get("Items", [])]
        folders.sort(key=lambda f: f.name.lower())
        return folders

    def get_owned(self, folder_id: str, owner_id: str) -> Optional[Folder]:
        resp = self._t.get_item(Key={"pk": f"USER#{owner_id}", "sk": f"FOLDER#{folder_id}"})
        item = resp.get("Item")
        return _folder_from_item(item) if item else None

    def create(self, folder: Folder) -> Folder:
        self._t.put_item(Item=_folder_item(folder))
        return folder

    def update(self, folder: Folder) -> Folder:
        self._t.put_item(Item=_folder_item(folder))
        return folder

    def delete(self, folder: Folder) -> None:
        self._t.delete_item(Key={"pk": f"USER#{folder.owner_id}", "sk": f"FOLDER#{folder.id}"})


# ── Project ──────────────────────────────────────────────────────
def _project_item(p: Project) -> dict:
    item = {
        "pk": f"USER#{p.owner_id}",
        "sk": f"PROJECT#{p.id}",
        "type": "project",
        "id": p.id,
        "owner_id": p.owner_id,
        "title": p.title,
        "artist": p.artist,
        "description": p.description,
        "has_score": bool(p.has_score),
        "created_at": _iso(p.created_at),
        "updated_at": _iso(p.updated_at),
    }
    if p.original_filename:
        item["original_filename"] = p.original_filename
    if p.folder_id:
        item["folder_id"] = p.folder_id
        # GSI3 sparse: solo proyectos con carpeta participan.
        item["gsi3pk"] = f"USER#{p.owner_id}#FOLDER#{p.folder_id}"
        item["gsi3sk"] = p.id
    return item


def _project_from_item(it: dict) -> Project:
    return Project(
        id=it["id"],
        owner_id=it["owner_id"],
        folder_id=it.get("folder_id"),
        title=it.get("title", ""),
        artist=it.get("artist", ""),
        description=it.get("description", ""),
        has_score=bool(it.get("has_score", False)),
        original_filename=it.get("original_filename"),
        created_at=_dt(it.get("created_at")),
        updated_at=_dt(it.get("updated_at")),
    )


class _DynamoProjectRepository:
    def __init__(self, table):
        self._t = table

    def list_for_owner(self, owner_id: str) -> list[Project]:
        resp = self._t.query(
            KeyConditionExpression=Key("pk").eq(f"USER#{owner_id}") & Key("sk").begins_with("PROJECT#")
        )
        projects = [_project_from_item(it) for it in resp.get("Items", [])]
        projects.sort(key=lambda p: _iso(p.updated_at) or "", reverse=True)
        return projects

    def get_owned(self, project_id: str, owner_id: str) -> Optional[Project]:
        resp = self._t.get_item(Key={"pk": f"USER#{owner_id}", "sk": f"PROJECT#{project_id}"})
        item = resp.get("Item")
        return _project_from_item(item) if item else None

    def create(self, project: Project) -> Project:
        self._t.put_item(Item=_project_item(project))
        self._t.update_item(
            Key={"pk": f"USER#{project.owner_id}", "sk": "PROFILE"},
            UpdateExpression="ADD project_count :one",
            ExpressionAttributeValues={":one": 1},
        )
        _stats_bump(self._t, project_delta=1)
        return project

    def update(self, project: Project) -> Project:
        self._t.put_item(Item=_project_item(project))
        return project

    def delete(self, project: Project) -> None:
        self._t.delete_item(Key={"pk": f"USER#{project.owner_id}", "sk": f"PROJECT#{project.id}"})
        self._t.update_item(
            Key={"pk": f"USER#{project.owner_id}", "sk": "PROFILE"},
            UpdateExpression="ADD project_count :neg",
            ExpressionAttributeValues={":neg": -1},
        )
        _stats_bump(self._t, project_delta=-1)

    def reassign_folder(
        self, from_folder_id: str, to_folder_id: Optional[str], owner_id: str
    ) -> None:
        resp = self._t.query(
            IndexName="GSI3",
            KeyConditionExpression=Key("gsi3pk").eq(f"USER#{owner_id}#FOLDER#{from_folder_id}"),
        )
        for it in resp.get("Items", []):
            project = _project_from_item(it)
            project.folder_id = to_folder_id
            self._t.put_item(Item=_project_item(project))


# ── Eventos de login ─────────────────────────────────────────────
class _DynamoEventRepository:
    def __init__(self, table):
        self._t = table

    def record_login(self, event: LoginEvent) -> None:
        ts = event.id  # ULID → orden cronológico
        self._t.put_item(
            Item={
                "pk": f"USER#{event.user_id}",
                "sk": f"LOGIN#{ts}",
                "type": "login_event",
                "gsi1pk": "LOGINS",
                "gsi1sk": ts,
                "id": event.id,
                "user_id": event.user_id,
                "email": event.email,
                "created_at": _iso(event.created_at),
            }
        )

    def last_login_for(self, user_id: str) -> Optional[LoginEvent]:
        resp = self._t.query(
            KeyConditionExpression=Key("pk").eq(f"USER#{user_id}") & Key("sk").begins_with("LOGIN#"),
            ScanIndexForward=False,
            Limit=1,
        )
        items = resp.get("Items", [])
        return self._login_from_item(items[0]) if items else None

    def recent_logins(self, limit: int = 20) -> list[LoginEvent]:
        resp = self._t.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("gsi1pk").eq("LOGINS"),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [self._login_from_item(it) for it in resp.get("Items", [])]

    @staticmethod
    def _login_from_item(it: dict) -> LoginEvent:
        return LoginEvent(
            id=it["id"],
            user_id=it["user_id"],
            email=it.get("email", ""),
            created_at=_dt(it.get("created_at")),
        )


# ── Tokens de reseteo ────────────────────────────────────────────
class _DynamoResetTokenRepository:
    def __init__(self, table):
        self._t = table

    def create(self, token: PasswordResetToken) -> None:
        self._t.put_item(
            Item={
                "pk": f"RESET#{token.token}",
                "sk": "RESET",
                "type": "reset_token",
                "token": token.token,
                "user_id": token.user_id,
                "email": token.email,
                "expires_at": _iso(token.expires_at),
                "ttl": int(token.expires_at.timestamp()),
            }
        )

    def get(self, token: str) -> Optional[PasswordResetToken]:
        resp = self._t.get_item(Key={"pk": f"RESET#{token}", "sk": "RESET"})
        it = resp.get("Item")
        if not it:
            return None
        return PasswordResetToken(
            token=it["token"], user_id=it["user_id"], email=it["email"], expires_at=_dt(it["expires_at"])
        )

    def delete(self, token: str) -> None:
        self._t.delete_item(Key={"pk": f"RESET#{token}", "sk": "RESET"})


# ── Contacto ─────────────────────────────────────────────────────
class _DynamoContactRepository:
    def __init__(self, table):
        self._t = table

    def create(self, message: ContactMessage) -> ContactMessage:
        self._t.put_item(
            Item={
                "pk": "CONTACT",
                "sk": f"MSG#{message.id}",
                "type": "contact",
                "id": message.id,
                "name": message.name,
                "email": message.email,
                "subject": message.subject,
                "body": message.body,
                "created_at": _iso(message.created_at),
            }
        )
        return message

    def list_recent(
        self, limit: int = 50, cursor: Optional[str] = None
    ) -> tuple[list[ContactMessage], Optional[str]]:
        kwargs: dict = {
            "KeyConditionExpression": Key("pk").eq("CONTACT") & Key("sk").begins_with("MSG#"),
            "ScanIndexForward": False,
            "Limit": limit,
        }
        if cursor:
            kwargs["ExclusiveStartKey"] = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        resp = self._t.query(**kwargs)
        msgs = [
            ContactMessage(
                id=it["id"], name=it["name"], email=it["email"],
                subject=it.get("subject", ""), body=it.get("body", ""),
                created_at=_dt(it.get("created_at")),
            )
            for it in resp.get("Items", [])
        ]
        last = resp.get("LastEvaluatedKey")
        next_cursor = base64.urlsafe_b64encode(json.dumps(last).encode()).decode() if last else None
        return msgs, next_cursor


# ── Estadísticas ─────────────────────────────────────────────────
def _stats_bump(
    table,
    user_delta: int = 0,
    project_delta: int = 0,
    role_deltas: Optional[dict[str, int]] = None,
) -> None:
    """Actualiza contadores agregados con ADD atómico (best-effort)."""
    names: dict[str, str] = {}
    values: dict[str, int] = {}
    sets: list[str] = []
    if user_delta:
        names["#u"] = "user_count"
        values[":u"] = user_delta
        sets.append("#u :u")
    if project_delta:
        names["#p"] = "project_count"
        values[":p"] = project_delta
        sets.append("#p :p")
    for i, (role, delta) in enumerate((role_deltas or {}).items()):
        if not delta:
            continue
        names[f"#r{i}"] = f"users_{role}"
        values[f":r{i}"] = delta
        sets.append(f"#r{i} :r{i}")
    if not sets:
        return
    table.update_item(
        Key={"pk": "STATS", "sk": "GLOBAL"},
        UpdateExpression="ADD " + ", ".join(sets),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


class _DynamoStatsRepository:
    def __init__(self, table):
        self._t = table

    def bump(self, user_delta: int = 0, project_delta: int = 0, role_deltas: Optional[dict[str, int]] = None) -> None:
        _stats_bump(self._t, user_delta=user_delta, project_delta=project_delta, role_deltas=role_deltas)

    def get(self) -> GlobalStats:
        resp = self._t.get_item(Key={"pk": "STATS", "sk": "GLOBAL"})
        it = resp.get("Item") or {}
        return GlobalStats(
            user_count=_int(it.get("user_count", 0)),
            project_count=_int(it.get("project_count", 0)),
            users_admin=_int(it.get("users_admin", 0)),
            users_free=_int(it.get("users_free", 0)),
            users_pro=_int(it.get("users_pro", 0)),
            users_invited=_int(it.get("users_invited", 0)),
        )

    def recompute(self) -> GlobalStats:
        stats = GlobalStats()
        kwargs: dict = {"FilterExpression": Attr("type").is_in(["user", "project"])}
        while True:
            resp = self._t.scan(**kwargs)
            for it in resp.get("Items", []):
                if it.get("type") == "user":
                    stats.user_count += 1
                    role = it.get("role", "free")
                    setattr(stats, f"users_{role}", getattr(stats, f"users_{role}", 0) + 1)
                elif it.get("type") == "project":
                    stats.project_count += 1
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        self._t.put_item(
            Item={
                "pk": "STATS",
                "sk": "GLOBAL",
                "type": "stats",
                "user_count": stats.user_count,
                "project_count": stats.project_count,
                "users_admin": stats.users_admin,
                "users_free": stats.users_free,
                "users_pro": stats.users_pro,
                "users_invited": stats.users_invited,
            }
        )
        return stats


class DynamoRepositories:
    def __init__(self) -> None:
        table = _table()
        self.users = _DynamoUserRepository(table)
        self.folders = _DynamoFolderRepository(table)
        self.projects = _DynamoProjectRepository(table)
        self.events = _DynamoEventRepository(table)
        self.reset_tokens = _DynamoResetTokenRepository(table)
        self.contacts = _DynamoContactRepository(table)
        self.stats = _DynamoStatsRepository(table)
