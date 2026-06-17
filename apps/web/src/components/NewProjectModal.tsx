import { useState } from "react";

import { api } from "../lib/api";
import Icon from "./ui/Icon";
import Modal from "./ui/Modal";

// Instrumentos básicos (programa General MIDI). Los graves usan clave de Fa.
const INSTRUMENTS: { label: string; program: number }[] = [
  { label: "Piano", program: 0 },
  { label: "Guitarra (nylon)", program: 24 },
  { label: "Guitarra (acero)", program: 25 },
  { label: "Guitarra eléctrica", program: 27 },
  { label: "Bajo eléctrico", program: 33 },
  { label: "Violín", program: 40 },
  { label: "Violonchelo", program: 42 },
  { label: "Contrabajo", program: 43 },
  { label: "Flauta", program: 73 },
  { label: "Trompeta", program: 56 },
  { label: "Saxo alto", program: 65 },
  { label: "Voz", program: 52 },
  { label: "Sintetizador", program: 81 },
];

const isBass = (program: number) => program >= 32 && program <= 43;
const escTex = (s: string) => s.replace(/"/g, "'");

interface Track {
  name: string;
  program: number;
}

export default function NewProjectModal({
  open,
  onClose,
  folderId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  folderId: string | null;
  onCreated: (projectId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [num, setNum] = useState(4);
  const [den, setDen] = useState(4);
  const [tempo, setTempo] = useState(90);
  const [tracks, setTracks] = useState<Track[]>([{ name: "Pista 1", program: 0 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setTrack(i: number, patch: Partial<Track>) {
    setTracks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function addTrack() {
    setTracks((ts) => [...ts, { name: `Pista ${ts.length + 1}`, program: 0 }]);
  }
  function removeTrack(i: number) {
    setTracks((ts) => (ts.length > 1 ? ts.filter((_, j) => j !== i) : ts));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const finalTitle = title.trim() || "Sin título";
    setBusy(true);
    try {
      // Construimos la partitura inicial con AlphaTex (pistas, compás, tempo) y
      // ajustamos el instrumento de cada pista sobre el modelo antes de guardar.
      const rests = Array(Math.max(1, num)).fill("r").join(" ");
      let tex = `\\title "${escTex(finalTitle)}" \\artist "${escTex(artist)}" \\tempo ${tempo}\n.\n`;
      for (const t of tracks) {
        const clef = isBass(t.program) ? "F4" : "G2";
        tex += `\\track "${escTex(t.name)}"\n\\clef ${clef} \\ts ${num} ${den}\n:${den} ${rests} |\n`;
      }

      const at = await import("@coderline/alphatab");
      const score = at.importer.ScoreLoader.loadAlphaTex(tex);
      tracks.forEach((t, i) => {
        if (score.tracks[i]) {
          score.tracks[i].name = t.name;
          score.tracks[i].playbackInfo.program = t.program;
        }
      });
      const scoreJson = JSON.parse(at.model.JsonConverter.scoreToJson(score));

      const project = await api.createProject(finalTitle, artist, folderId);
      await api.updateProject(project.id, { score: scoreJson });
      onCreated(project.id);
    } catch (err) {
      console.error("[nuevo proyecto]", err);
      setError("No se pudo crear el proyecto. Revisa los datos.");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo proyecto" width={520}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Título</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mi canción"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Autor</span>
            <input
              className="input"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Tu nombre"
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Compás</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={32}
                className="input text-center"
                value={num}
                onChange={(e) => setNum(Math.max(1, Number(e.target.value) || 4))}
              />
              <span className="text-slate-500">/</span>
              <select
                className="input"
                value={den}
                onChange={(e) => setDen(Number(e.target.value))}
              >
                {[1, 2, 4, 8, 16].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Tempo (BPM)</span>
            <input
              type="number"
              min={20}
              max={400}
              className="input"
              value={tempo}
              onChange={(e) => setTempo(Math.max(20, Number(e.target.value) || 90))}
            />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pistas</span>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-accent hover:underline"
              onClick={addTrack}
            >
              <Icon name="plus" size={14} /> Añadir pista
            </button>
          </div>
          <div className="space-y-2">
            {tracks.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={t.name}
                  onChange={(e) => setTrack(i, { name: e.target.value })}
                  placeholder={`Pista ${i + 1}`}
                />
                <select
                  className="input flex-1"
                  value={t.program}
                  onChange={(e) => setTrack(i, { program: Number(e.target.value) })}
                >
                  {INSTRUMENTS.map((ins) => (
                    <option key={ins.program} value={ins.program}>
                      {ins.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-ink-600 hover:text-red-400 disabled:opacity-30"
                  onClick={() => removeTrack(i)}
                  disabled={tracks.length <= 1}
                  aria-label="Quitar pista"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Creando…" : "Crear proyecto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
