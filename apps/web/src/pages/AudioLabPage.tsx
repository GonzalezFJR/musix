import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, getToken, type AudioEngine, type AudioJob, type AudioKind } from "../lib/api";

const KIND_LABEL: Record<AudioKind, string> = {
  analysis: "Análisis",
  separation: "Separación de pistas",
  transcription: "Transcripción a MIDI",
};
const KINDS: AudioKind[] = ["analysis", "separation", "transcription"];

// Descarga un artefacto con el token Bearer y devuelve un object URL.
async function fetchOutputUrl(jobId: string, name: string): Promise<string> {
  const res = await fetch(api.audioOutputPath(jobId, name), {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) throw new Error("No se pudo descargar el artefacto");
  return URL.createObjectURL(await res.blob());
}

function StatusBadge({ status }: { status: AudioJob["status"] }) {
  const styles: Record<string, string> = {
    queued: "bg-slate-600/40 text-slate-300",
    running: "bg-amber-500/20 text-amber-300 animate-pulse",
    done: "bg-emerald-500/20 text-emerald-300",
    error: "bg-rose-500/20 text-rose-300",
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{status}</span>;
}

function OutputItem({ job, name, kind }: { job: AudioJob; name: string; kind: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== "audio") return;
    let revoked: string | null = null;
    fetchOutputUrl(job.id, name).then((u) => { revoked = u; setUrl(u); }).catch(() => {});
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [job.id, name, kind]);

  async function download() {
    const u = await fetchOutputUrl(job.id, name);
    const a = document.createElement("a");
    a.href = u; a.download = name; a.click();
    URL.revokeObjectURL(u);
  }

  return (
    <div className="flex items-center gap-3 rounded bg-slate-800/60 px-3 py-2">
      <span className="font-mono text-xs text-slate-300">{name}</span>
      {kind === "audio" && url && <audio controls src={url} className="h-8 flex-1" />}
      <button onClick={download} className="ml-auto text-xs text-sky-400 hover:underline">
        descargar
      </button>
    </div>
  );
}

function JobCard({ job, onChanged }: { job: AudioJob; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function run() {
    setBusy(true);
    try { await api.runAudioJob(job.id); onChanged(); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api.deleteAudioJob(job.id); onChanged(); } finally { setBusy(false); }
  }
  async function toProject() {
    setBusy(true);
    try {
      const { project_id } = await api.audioJobToProject(job.id);
      navigate(`/projects/${project_id}`);
    } finally { setBusy(false); }
  }
  const hasMidi = job.outputs.some((o) => o.kind === "midi" || o.name.endsWith(".mid"));
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-100">{KIND_LABEL[job.kind]}</span>
        <span className="text-xs text-slate-400">· {job.engine}</span>
        <StatusBadge status={job.status} />
        <div className="ml-auto flex gap-2">
          {job.status === "queued" && (
            <button onClick={run} disabled={busy} className="text-xs text-emerald-400 hover:underline">
              ejecutar ahora
            </button>
          )}
          <button onClick={remove} disabled={busy} className="text-xs text-rose-400 hover:underline">
            borrar
          </button>
        </div>
      </div>
      <div className="mt-1 truncate text-xs text-slate-500">{job.input_filename}</div>

      {job.error && <div className="mt-2 rounded bg-rose-500/10 p-2 text-xs text-rose-300">{job.error}</div>}

      {job.status === "done" && (
        <div className="mt-3 space-y-2">
          {Object.keys(job.result).length > 0 && (
            <pre className="max-h-48 overflow-auto rounded bg-slate-950/70 p-3 text-xs text-slate-300">
              {JSON.stringify(job.result, null, 2)}
            </pre>
          )}
          {job.outputs.map((o) => (
            <OutputItem key={o.name} job={job} name={o.name} kind={o.kind} />
          ))}
          {hasMidi && (
            <button
              onClick={toProject}
              disabled={busy}
              className="w-full rounded bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Convertir a proyecto Musix
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AudioLabPage() {
  const [engines, setEngines] = useState<AudioEngine[]>([]);
  const [jobs, setJobs] = useState<AudioJob[]>([]);
  const [kind, setKind] = useState<AudioKind>("analysis");
  const [engineId, setEngineId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => api.listAudioJobs().then((r) => setJobs(r.jobs)), []);

  useEffect(() => {
    api.audioEngines().then(setEngines).catch(() => {});
    refresh().catch(() => {});
  }, [refresh]);

  // Polling mientras haya jobs activos.
  const hasActive = useMemo(() => jobs.some((j) => j.status === "queued" || j.status === "running"), [jobs]);
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [hasActive, refresh]);

  const enginesForKind = engines.filter((e) => e.kind === kind);
  // Selecciona por defecto el primer engine disponible del tipo elegido.
  useEffect(() => {
    if (!enginesForKind.some((e) => e.id === engineId)) {
      setEngineId(enginesForKind.find((e) => e.available)?.id ?? enginesForKind[0]?.id ?? "");
    }
  }, [kind, engines]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setError(null);
    if (!engineId) return setError("Elige un engine");
    if (!file && !youtubeUrl.trim()) return setError("Sube un audio o pega un enlace de YouTube");
    setSubmitting(true);
    try {
      await api.createAudioJob({ kind, engine: engineId, file, youtubeUrl: youtubeUrl.trim() || undefined });
      setFile(null); setYoutubeUrl("");
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando el job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center gap-4 border-b border-slate-800 px-6 py-4">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">← Panel</Link>
        <h1 className="text-lg font-semibold">Audio Lab</h1>
        <span className="text-xs text-slate-500">análisis · separación · transcripción (pruebas)</span>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 p-6 md:grid-cols-2">
        {/* Formulario */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nuevo procesamiento</h2>

          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded px-3 py-1.5 text-xs ${kind === k ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <label className="block text-sm">
            <span className="text-slate-400">Engine</span>
            <select
              value={engineId}
              onChange={(e) => setEngineId(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm"
            >
              {enginesForKind.length === 0 && <option value="">(ninguno disponible)</option>}
              {enginesForKind.map((e) => (
                <option key={e.id} value={e.id} disabled={!e.available}>
                  {e.label} {e.available ? "" : "(no disponible)"} {e.needs_gpu ? "· GPU" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-dashed border-slate-700 p-4">
            <input
              ref={fileInput}
              type="file"
              accept=".mp3,.wav,.flac,.m4a,.ogg,.opus,.aac,.aiff"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-200"
            />
            <div className="my-2 text-center text-xs text-slate-500">— o —</div>
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          {error && <div className="rounded bg-rose-500/10 p-2 text-xs text-rose-300">{error}</div>}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full rounded bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Procesar"}
          </button>
        </section>

        {/* Jobs */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Trabajos</h2>
          {jobs.length === 0 && <p className="text-sm text-slate-500">Aún no hay trabajos.</p>}
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} onChanged={() => refresh().catch(() => {})} />
          ))}
        </section>
      </main>
    </div>
  );
}
