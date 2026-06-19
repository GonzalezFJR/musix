import json
import tempfile
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, Response, UploadFile, status

from ..deps import CurrentUser, Repos
from ..models import Project, utcnow
from ..schemas import ProjectCreate, ProjectRead, ProjectSummary, ProjectUpdate
from ..services import midi_convert, score_engine
from ..storage import get_storage, original_key, project_prefix, score_key

router = APIRouter(prefix="/api/projects", tags=["projects"])

# Extensiones de import soportadas (las parsea AlphaTab en el cliente).
SUPPORTED_IMPORT = {
    ".gp3",
    ".gp4",
    ".gp5",
    ".gpx",
    ".gp",
    ".xml",
    ".musicxml",
    ".cap",
    ".mscz",
    ".mscx",
}


def _musescore_meta(data: bytes, ext: str) -> tuple[str | None, str | None]:
    """Best-effort: extrae (título, compositor) de un fichero MuseScore.

    `.mscz` es un ZIP que contiene el `.mscx` (XML nativo de MuseScore); `.mscx`
    es ese XML sin comprimir. Los metadatos viven en elementos `<metaTag name=...>`.
    """
    import io
    import xml.etree.ElementTree as ET
    import zipfile

    xml_bytes: bytes | None = None
    if ext == ".mscz":
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            name = next((n for n in zf.namelist() if n.endswith(".mscx")), None)
            if name:
                xml_bytes = zf.read(name)
    else:
        xml_bytes = data
    if not xml_bytes:
        return None, None

    root = ET.fromstring(xml_bytes)
    tags = {
        el.get("name"): (el.text or "").strip()
        for el in root.iter("metaTag")
    }
    return tags.get("workTitle") or None, tags.get("composer") or None


def _owned(project_id: str, user_id: str, repos) -> Project:
    project = repos.projects.get_owned(project_id, user_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proyecto no encontrado")
    return project


def _validate_folder(folder_id: str, user_id: str, repos) -> None:
    if folder_id is not None and repos.folders.get_owned(folder_id, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carpeta no encontrada")


def _load_score(project: Project) -> dict:
    if not project.has_score:
        return {}
    try:
        raw = get_storage().get(score_key(project.owner_id, project.id))
        return json.loads(raw)
    except (FileNotFoundError, ValueError):
        return {}


@router.get("", response_model=list[ProjectSummary])
def list_projects(user: CurrentUser, repos: Repos) -> list[Project]:
    return repos.projects.list_for_owner(user.id)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(data: ProjectCreate, user: CurrentUser, repos: Repos) -> ProjectRead:
    _validate_folder(data.folder_id, user.id, repos)
    project = repos.projects.create(
        Project(
            owner_id=user.id,
            title=data.title,
            artist=data.artist,
            description=data.description,
            folder_id=data.folder_id,
        )
    )
    return ProjectRead(**project.model_dump(), score={})


def build_project_from_midi(
    midi_bytes: bytes, title: str, folder_id: str | None, user, repos
) -> Project:
    """Convierte un MIDI en un proyecto Musix nuevo (cuantiza → sidecar → .mu6).

    Reutilizado por POST /projects/from-midi y POST /audio/jobs/{id}/to-project.
    Lanza HTTPException 400/503 si el sidecar rechaza el resultado o no está disponible.
    """
    if folder_id is not None:
        _validate_folder(folder_id, user.id, repos)
    spec = midi_convert.midi_to_score(midi_bytes, title=title)
    try:
        result = score_engine.apply(None, spec["ops"], spec["meta"])
    except score_engine.ScoreEngineError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"MIDI no convertible: {exc}") from exc
    except score_engine.ScoreEngineUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"score-engine no disponible: {exc}") from exc

    project = repos.projects.create(
        Project(owner_id=user.id, title=spec["meta"]["title"], folder_id=folder_id, has_score=True)
    )
    raw = json.dumps(result["score"], sort_keys=True, separators=(",", ":")).encode()
    get_storage().put(score_key(user.id, project.id), raw)
    return project


@router.post("/from-midi", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project_from_midi(
    user: CurrentUser,
    repos: Repos,
    file: UploadFile,
    title: str = Form(""),
    folder_id: str | None = Form(None),
) -> ProjectRead:
    """Crea un proyecto a partir de un fichero MIDI subido."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".mid", ".midi"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sube un fichero .mid/.midi")
    data = await file.read()
    project = build_project_from_midi(data, title or Path(file.filename or "").stem, folder_id, user, repos)
    return ProjectRead(**project.model_dump(), score=_load_score(project))


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, user: CurrentUser, repos: Repos) -> ProjectRead:
    project = _owned(project_id, user.id, repos)
    return ProjectRead(**project.model_dump(), score=_load_score(project))


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: str, data: ProjectUpdate, user: CurrentUser, repos: Repos
) -> ProjectRead:
    project = _owned(project_id, user.id, repos)
    if data.title is not None:
        project.title = data.title
    if data.artist is not None:
        project.artist = data.artist
    if data.description is not None:
        project.description = data.description
    # Mover de carpeta: move_to_root tiene prioridad (folder_id = None).
    if data.move_to_root:
        project.folder_id = None
    elif data.folder_id is not None:
        _validate_folder(data.folder_id, user.id, repos)
        project.folder_id = data.folder_id
    if data.score is not None:
        get_storage().put(
            score_key(user.id, project.id), json.dumps(data.score).encode()
        )
        project.has_score = True
    project.updated_at = utcnow()
    project = repos.projects.update(project)
    return ProjectRead(**project.model_dump(), score=_load_score(project))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, user: CurrentUser, repos: Repos) -> None:
    project = _owned(project_id, user.id, repos)
    repos.projects.delete(project)
    # Limpia ficheros del proyecto en el almacenamiento.
    get_storage().delete_prefix(project_prefix(user.id, project_id))


@router.post("/{project_id}/file", response_model=ProjectRead)
async def upload_file(
    project_id: str, file: UploadFile, user: CurrentUser, repos: Repos
) -> ProjectRead:
    project = _owned(project_id, user.id, repos)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_IMPORT:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Formato no soportado: {ext or '(sin extensión)'}",
        )
    data = await file.read()
    get_storage().put(original_key(user.id, project_id, ext), data)
    project.original_filename = file.filename
    project.updated_at = utcnow()

    # Best-effort: extraer metadatos con PyGuitarPro (formatos gp3-5). Requiere
    # un path en disco, así que usamos un temporal.
    if ext in {".gp3", ".gp4", ".gp5"}:
        try:
            import guitarpro

            with tempfile.NamedTemporaryFile(suffix=ext, delete=True) as tmp:
                tmp.write(data)
                tmp.flush()
                song = guitarpro.parse(tmp.name)
            if not project.title or project.title == "Sin título":
                project.title = song.title or project.title
            project.artist = song.artist or project.artist
        except Exception:
            pass  # no bloquear la subida si el parseo falla

    # Best-effort: metadatos de MuseScore (.mscz / .mscx).
    elif ext in {".mscz", ".mscx"}:
        try:
            title, composer = _musescore_meta(data, ext)
            if title and (not project.title or project.title == "Sin título"):
                project.title = title
            if composer:
                project.artist = composer
        except Exception:
            pass  # no bloquear la subida si el parseo falla

    project = repos.projects.update(project)
    return ProjectRead(**project.model_dump(), score=_load_score(project))


@router.get("/{project_id}/file")
def download_file(project_id: str, user: CurrentUser, repos: Repos) -> Response:
    project = _owned(project_id, user.id, repos)
    if not project.original_filename:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El proyecto no tiene fichero original")
    ext = Path(project.original_filename).suffix.lower()
    try:
        data = get_storage().get(original_key(user.id, project_id, ext))
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fichero no encontrado en el almacenamiento")
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{project.original_filename}"'},
    )
