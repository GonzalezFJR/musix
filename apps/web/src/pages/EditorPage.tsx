import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import ScoreViewer from "../components/ScoreViewer";
import Icon from "../components/ui/Icon";
import Toggle from "../components/ui/Toggle";
import Tooltip from "../components/ui/Tooltip";
import { api, type Project } from "../lib/api";

export default function EditorPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [source, setSource] = useState<ArrayBuffer | null>(null);
  const [scoreData, setScoreData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  // El visor puede cargar una partitura por su cuenta (proyecto vacío + subida),
  // así que confiamos en su aviso además de en source/scoreData iniciales.
  const [viewerHasScore, setViewerHasScore] = useState(false);

  async function load() {
    const p = await api.getProject(projectId);
    setProject(p);
    // Prioridad: formato propio guardado > fichero original importado.
    if (p.score && Object.keys(p.score).length > 0) {
      setScoreData(p.score);
    } else if (p.original_filename) {
      try {
        setSource(await api.fetchFileBytes(projectId));
      } catch {
        setError("No se pudo cargar el fichero del proyecto.");
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleSave(json: Record<string, unknown>) {
    const updated = await api.updateProject(projectId, { score: json });
    setProject(updated);
  }

  async function handleUpdateMeta(data: { title?: string; description?: string }) {
    const updated = await api.updateProject(projectId, data);
    setProject(updated);
  }

  const hasContent = Boolean(scoreData || source) || viewerHasScore;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-ink-600 bg-ink-900 px-5 py-3">
        <Tooltip label="Volver a todos tus proyectos" side="bottom">
          <Link
            to="/"
            aria-label="Volver a todos tus proyectos"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-ink-700 hover:text-slate-200"
          >
            <Icon name="arrowLeft" size={18} />
          </Link>
        </Tooltip>
        <h1 className="truncate font-semibold text-white">{project?.title ?? "…"}</h1>
        <div className="ml-auto flex items-center gap-3">
          <Toggle checked={editMode} onChange={setEditMode} label="Modo edición" disabled={!hasContent} />
        </div>
      </header>

      {error && <div className="bg-red-900/40 px-5 py-2 text-sm text-red-300">{error}</div>}

      <div className="min-h-0 flex-1">
        <ScoreViewer
          source={source}
          scoreData={scoreData}
          title={project?.title ?? "partitura"}
          projectId={projectId}
          onSave={handleSave}
          editMode={editMode}
          onEditModeChange={setEditMode}
          projectTitle={project?.title ?? ""}
          projectDescription={project?.description ?? ""}
          onUpdateMeta={handleUpdateMeta}
          onScoreLoadedChange={setViewerHasScore}
        />
      </div>
    </div>
  );
}
