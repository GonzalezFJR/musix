import * as alphaTab from "@coderline/alphatab";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useAuth } from "../auth/AuthContext";
import { useShortcuts } from "../hooks/useShortcuts";
import { useTheme, type Theme } from "../theme/ThemeContext";
import { api, type SfzInstrument } from "../lib/api";
import {
  chordDisplay,
  customChordId,
  knownChordId,
  NOTATION_OPTIONS,
  parseChordId,
  QUALITIES,
  rootName,
  type ChordNotation,
} from "../lib/chords";
import { GM_FAMILY_ORDER, GM_INSTRUMENTS } from "../lib/gm";
import {
  keySignatureFor,
  scaleAt,
  scaleColor,
  scaleDisplay,
  setScaleRange,
  shortestTranspose,
  type ModeKey,
  type ScaleAssignment,
} from "../lib/scales";
import { MetronomeEngine, type MetronomeConfig } from "../lib/metronome";
import { diatonicStepFromMidi, midiFromDiatonicStep, midiToName } from "../lib/pitch";
import Icon from "./ui/Icon";
import MusicGlyph, { type GlyphName } from "./ui/MusicGlyph";
import Tooltip from "./ui/Tooltip";
import Menu, { MenuItem } from "./ui/Menu";
import Modal from "./ui/Modal";
import MetronomeSettings from "./viewer/MetronomeSettings";
import MidiExportModal from "./viewer/MidiExportModal";
import Mp3ExportModal from "./viewer/Mp3ExportModal";
import PdfExportModal from "./viewer/PdfExportModal";
import LyricsView from "./viewer/LyricsView";
import LyricsPdfModal from "./viewer/LyricsPdfModal";
import CircleOfFifths from "./viewer/CircleOfFifths";
import ScalesPanel from "./viewer/ScalesPanel";
import RegionPanel from "./viewer/RegionPanel";
import SpeedSlider from "./viewer/SpeedSlider";
import { PlusMinus, ToolButton, ToolLabel } from "./viewer/ToolControls";
import ViewSettings from "./viewer/ViewSettings";
import {
  BLOCK_ORDER,
  frameClass,
  loadLayout,
  loadView,
  pageDims,
  saveLayout,
  saveView,
  type BlockId,
  type LayoutConfig,
  type Region,
  type ViewConfig,
} from "./viewer/viewConfig";

type Note = alphaTab.model.Note;
type Beat = alphaTab.model.Beat;

// Figuras de duración con su glifo SVG (denominador → valor del enum Duration).
// ── Colores de la partitura según el tema ────────────────────────
function hexColor(hex: string): alphaTab.model.Color {
  const n = parseInt(hex.replace("#", ""), 16);
  return new alphaTab.model.Color((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

// Paletas de notación (glifos, líneas, números de compás) por tema. En claro/normal
// la notación es oscura sobre papel claro; en oscuro, clara sobre fondo oscuro.
const SCORE_PALETTE: Record<Theme, Record<string, string>> = {
  normal: {
    mainGlyphColor: "#1b1d21",
    secondaryGlyphColor: "#5b6068",
    scoreInfoColor: "#1b1d21",
    staffLineColor: "#3a3d42",
    barSeparatorColor: "#3a3d42",
    barNumberColor: "#0f766e",
  },
  light: {
    mainGlyphColor: "#16181c",
    secondaryGlyphColor: "#565b63",
    scoreInfoColor: "#16181c",
    staffLineColor: "#33363b",
    barSeparatorColor: "#33363b",
    barNumberColor: "#0f766e",
  },
  dark: {
    mainGlyphColor: "#e8eaed",
    secondaryGlyphColor: "#99a0aa",
    scoreInfoColor: "#e8eaed",
    staffLineColor: "#6b727c",
    barSeparatorColor: "#8a919b",
    barNumberColor: "#5eead4",
  },
};

// Aplica la paleta de notación al render de AlphaTab para el tema dado.
function applyScoreTheme(api: alphaTab.AlphaTabApi, theme: Theme): void {
  const res = api.settings.display.resources as unknown as Record<string, alphaTab.model.Color>;
  const palette = SCORE_PALETTE[theme] ?? SCORE_PALETTE.normal;
  for (const [key, hex] of Object.entries(palette)) {
    res[key] = hexColor(hex);
  }
}

const DURATIONS: { label: string; glyph: GlyphName; title: string; value: alphaTab.model.Duration }[] = [
  { label: "1", glyph: "whole", title: "Redonda", value: alphaTab.model.Duration.Whole },
  { label: "2", glyph: "half", title: "Blanca", value: alphaTab.model.Duration.Half },
  { label: "4", glyph: "quarter", title: "Negra", value: alphaTab.model.Duration.Quarter },
  { label: "8", glyph: "eighth", title: "Corchea", value: alphaTab.model.Duration.Eighth },
  { label: "16", glyph: "sixteenth", title: "Semicorchea", value: alphaTab.model.Duration.Sixteenth },
  { label: "32", glyph: "thirtysecond", title: "Fusa", value: alphaTab.model.Duration.ThirtySecond },
];

interface TrackInfo {
  index: number;
  name: string;
}
interface Selection {
  bar: number | null;
  label: string;
  hasBeat: boolean; // hay un beat seleccionado (para mostrar herramientas)
  hasNote: boolean;
  dynamics: number;
  triplet: boolean;
  tie: boolean;
  dots: number;
  crescendo: number;
  clef: number;
  keySig: number;
  timeNum: number;
  timeDen: number;
  repeatStart: boolean;
  repeatEnd: boolean;
  endings: number; // bitmask de vueltas
  direction: number | null;
  track: number; // pista del beat seleccionado
  text: string; // frase/anotación de texto del beat
  lyric: string; // letra del beat (beat.lyrics[0], nativo de AlphaTab)
  chordId: string | null; // id del acorde del beat
  beatId: number; // id del beat (para keyear inputs controlados)
  section: string; // título de sección del compás (masterBar.section)
}

const DYNAMICS: { label: string; value: number; desc: string }[] = [
  { label: "pp", value: 1, desc: "Pianissimo · muy suave" },
  { label: "p", value: 2, desc: "Piano · suave" },
  { label: "mp", value: 3, desc: "Mezzo piano · medio suave" },
  { label: "mf", value: 4, desc: "Mezzo forte · medio fuerte" },
  { label: "f", value: 5, desc: "Forte · fuerte" },
  { label: "ff", value: 6, desc: "Fortissimo · muy fuerte" },
];
const CLEFS: { label: string; value: alphaTab.model.Clef }[] = [
  { label: "Sol", value: alphaTab.model.Clef.G2 },
  { label: "Fa", value: alphaTab.model.Clef.F4 },
  { label: "Do3", value: alphaTab.model.Clef.C3 },
  { label: "Do4", value: alphaTab.model.Clef.C4 },
  { label: "Neutra", value: alphaTab.model.Clef.Neutral },
];
// Tonalidades por nº de alteraciones (KeySignature: sostenidos +, bemoles −).
const KEYS: { label: string; value: number }[] = [
  { label: "7♭", value: -7 }, { label: "6♭", value: -6 }, { label: "5♭", value: -5 },
  { label: "4♭", value: -4 }, { label: "3♭", value: -3 }, { label: "2♭", value: -2 },
  { label: "1♭", value: -1 }, { label: "Do", value: 0 }, { label: "1♯", value: 1 },
  { label: "2♯", value: 2 }, { label: "3♯", value: 3 }, { label: "4♯", value: 4 },
  { label: "5♯", value: 5 }, { label: "6♯", value: 6 }, { label: "7♯", value: 7 },
];
// Marcas de repetición/salto (Direction). Una por compás (simplificación del MVP).
const DIRECTIONS: { label: string; value: alphaTab.model.Direction | null }[] = [
  { label: "— sin marca —", value: null },
  { label: "Segno", value: alphaTab.model.Direction.TargetSegno },
  { label: "Coda", value: alphaTab.model.Direction.TargetCoda },
  { label: "Fine", value: alphaTab.model.Direction.TargetFine },
  { label: "Da Capo", value: alphaTab.model.Direction.JumpDaCapo },
  { label: "D.C. al Fine", value: alphaTab.model.Direction.JumpDaCapoAlFine },
  { label: "D.C. al Coda", value: alphaTab.model.Direction.JumpDaCapoAlCoda },
  { label: "Dal Segno", value: alphaTab.model.Direction.JumpDalSegno },
  { label: "D.S. al Fine", value: alphaTab.model.Direction.JumpDalSegnoAlFine },
  { label: "D.S. al Coda", value: alphaTab.model.Direction.JumpDalSegnoAlCoda },
];
interface Props {
  source: ArrayBuffer | null;
  scoreData?: Record<string, unknown> | null;
  title?: string;
  projectId?: string;
  onSave?: (scoreJson: Record<string, unknown>) => Promise<void> | void;
  editMode: boolean;
  onEditModeChange: (v: boolean) => void;
  projectTitle?: string;
  projectDescription?: string;
  onUpdateMeta?: (data: { title?: string; description?: string }) => Promise<void> | void;
  onScoreLoadedChange?: (loaded: boolean) => void;
}

// Paleta por defecto para el cronograma de pistas (se asigna por índice de pista).
const TRACK_PALETTE = [
  "#2dd4bf", "#a78bfa", "#f472b6", "#fbbf24", "#60a5fa",
  "#34d399", "#f87171", "#c084fc", "#fb923c", "#4ade80",
];

// Instrumento de render asignado a una pista: programa General MIDI (SF2) o un
// instrumento SFZ del catálogo (id). El SF2 vive además en el score; el SFZ solo
// aquí (la previsualización en vivo cae al programa GM de la pista).
export type TrackInstrument =
  | { engine: "sf2"; program: number }
  | { engine: "sfz"; id: string };

// Preferencias por proyecto (colores de pista, notación de acordes, instrumentos).
interface ProjectPrefs {
  trackColors: Record<number, string>;
  chordNotation: ChordNotation;
  instruments: Record<number, TrackInstrument>;
  descriptions: Record<number, string>;
  playbackPitch: number;
  scales: ScaleAssignment[];
}
function prefsKey(projectId?: string) {
  return `musix_prefs_${projectId ?? "default"}`;
}
function loadPrefs(projectId?: string): ProjectPrefs {
  const fallback: ProjectPrefs = { trackColors: {}, chordNotation: "american", instruments: {}, descriptions: {}, playbackPitch: 0, scales: [] };
  try {
    const raw = localStorage.getItem(prefsKey(projectId));
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return fallback;
}

const SPEED_MIN = 0.25;
const SPEED_MAX = 4;
const SPEED_STEP = 0.05;
const MAX_FRET = 24;
const clampSpeed = (v: number) => Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(v * 100) / 100));
const clampFret = (v: number) => Math.min(MAX_FRET, Math.max(0, v));

export default function ScoreViewer({
  source,
  scoreData,
  title = "partitura",
  projectId,
  onSave,
  editMode,
  onEditModeChange,
  projectTitle,
  projectDescription,
  onUpdateMeta,
  onScoreLoadedChange,
}: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  // El render de audio del servidor (export a MP3 + instrumentos SFZ, que solo se
  // tocan en ese render) es la única operación pesada del backend; se reserva a
  // cuentas Pro/admin. Los instrumentos General MIDI NO entran aquí: se reproducen
  // en el navegador (AlphaSynth) y los puede usar cualquiera. El backend exige el
  // permiso de verdad (403); aquí solo ocultamos lo vetado.
  const canRenderAudio = user?.role === "pro" || user?.role === "admin";
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const metroRef = useRef<MetronomeEngine | null>(null);
  const barBoundsRef = useRef<number[]>([]);

  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set()); // visibles en la partitura
  const [mutedTracks, setMutedTracks] = useState<Set<number>>(new Set()); // silenciadas en reproducción
  const [soloTrack, setSoloTrack] = useState<number | null>(null);
  // Volumen de reproducción: master (0–1.5, 1 = 100%) y multiplicador por pista (0–1.5).
  const [masterVol, setMasterVol] = useState(1);
  const masterVolRef = useRef(1);
  const [trackVolumes, setTrackVolumes] = useState<Record<number, number>>({});
  const [trackPrograms, setTrackPrograms] = useState<Record<number, number>>({}); // programa GM por pista (SF2)
  const [trackInstruments, setTrackInstruments] = useState<Record<number, TrackInstrument>>(
    () => loadPrefs(projectId).instruments,
  );
  const [sfzCatalog, setSfzCatalog] = useState<SfzInstrument[]>([]);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [scoreTitle, setScoreTitle] = useState("");
  const [hasScore, setHasScore] = useState(false);

  const [speed, setSpeed] = useState(1);
  const [metroOn, setMetroOn] = useState(false);
  const [metroCfg, setMetroCfg] = useState<MetronomeConfig>({ subdivision: "quarter", accent: "first" });
  const [looping, setLooping] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<ViewConfig>(loadView);
  const [layout, setLayout] = useState<LayoutConfig>(loadLayout);
  const [trackColors, setTrackColors] = useState<Record<number, string>>(() => loadPrefs(projectId).trackColors);
  const [trackDescriptions, setTrackDescriptions] = useState<Record<number, string>>(() => loadPrefs(projectId).descriptions);
  const [chordNotation, setChordNotation] = useState<ChordNotation>(() => loadPrefs(projectId).chordNotation);
  // Pista cuya ventana de configuración está abierta (doble clic en el panel).
  const [trackModal, setTrackModal] = useState<number | null>(null);
  // Contador para forzar relecturas de las opciones de staff tras cambiarlas.
  const [staffRev, setStaffRev] = useState(0);
  // Pitch global de REPRODUCCIÓN (no toca la notación): traspone el sonido N semitonos.
  const [playbackPitch, setPlaybackPitch] = useState(() => loadPrefs(projectId).playbackPitch);
  const playbackPitchRef = useRef(playbackPitch);
  // Asignaciones de escala/tonalidad por rango de compases (metadato del proyecto).
  const [scaleAssignments, setScaleAssignments] = useState<ScaleAssignment[]>(
    () => loadPrefs(projectId).scales,
  );
  // Modo "Escalas": muestra el panel y colorea las zonas asignadas sobre la partitura.
  const [scalesMode, setScalesMode] = useState(false);
  const [circleOpen, setCircleOpen] = useState(false);
  const [scopeMode, setScopeMode] = useState<"all" | "selection">("all");
  const [scalePicker, setScalePicker] = useState<{ tonic: number; mode: ModeKey }>({
    tonic: 0,
    mode: "ionian",
  });
  // Confirmación de transposición por escala (datos calculados a confirmar).
  const [scaleTranspose, setScaleTranspose] = useState<{
    start: number;
    end: number;
    delta: number;
    fromLabel: string;
    toLabel: string;
    target: { tonic: number; mode: ModeKey };
    wholePiece: boolean;
  } | null>(null);
  // Cajas de color de las zonas de escala (overlay sobre la partitura).
  const [scaleBoxes, setScaleBoxes] = useState<
    { x: number; y: number; w: number; h: number; color: string; label?: string }[]
  >([]);
  // Tick que sube en cada postRenderFinished: refresca overlays que leen estado React.
  const [postRenderTick, setPostRenderTick] = useState(0);
  // Prefs pendientes de aplicar tras cargar un fichero Musix autocontenido.
  const pendingPrefsRef = useRef<Partial<ProjectPrefs> | null>(null);
  // Herramienta de transposición real (modifica la partitura): modal.
  const [transposeOpen, setTransposeOpen] = useState(false);
  const [transposeTargets, setTransposeTargets] = useState<Set<number>>(new Set());
  const [transposeSemis, setTransposeSemis] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Edición
  const [selection, setSelection] = useState<Selection | null>(null);
  const [chordMode, setChordMode] = useState<"known" | "custom">("known");
  const [chordDraft, setChordDraft] = useState<{ root: number | null; quality: string }>({
    root: null,
    quality: "maj",
  });
  // Selección múltiple (arrastrando): beats sobre los que aplicar operaciones en lote.
  const [multiBeats, setMultiBeats] = useState<Beat[]>([]);
  const multiBeatsRef = useRef<Beat[]>([]);
  const draggingRef = useRef(false);
  const dragStartRef = useRef<Beat | null>(null);
  // Modal de anotación activo: texto, acorde o sección.
  const [annotModal, setAnnotModal] = useState<null | "text" | "chord" | "section" | "lyric">(null);
  const [textDraft, setTextDraft] = useState("");
  const [lyricDraft, setLyricDraft] = useState("");
  const [sectionDraft, setSectionDraft] = useState("");
  const [customDraft, setCustomDraft] = useState("");
  const [midiModalOpen, setMidiModalOpen] = useState(false);
  const [mp3ModalOpen, setMp3ModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [lyricsPdfOpen, setLyricsPdfOpen] = useState(false);
  // Beat actualmente sonando (vista de letra: resalta verso del compás + pulso/acorde).
  const [playedBeat, setPlayedBeat] = useState<Beat | null>(null);
  // Versión del modelo: se incrementa en cada edición para refrescar la vista de letra.
  const [lyricsVersion, setLyricsVersion] = useState(0);
  const bumpLyrics = useCallback(() => setLyricsVersion((v) => v + 1), []);
  const editModeRef = useRef(editMode);
  const metroOnRef = useRef(metroOn);
  const cursorRef = useRef<{ beat: Beat | null; string: number }>({ beat: null, string: 3 });
  const fretBufRef = useRef<{ value: number; t: number }>({ value: 0, t: 0 });
  const midiDirtyRef = useRef(false); // audio pendiente de regenerar (al pulsar play)
  const scrollSaveRef = useRef<{ top: number; left: number } | null>(null);

  // Cursor visual sobre la partitura (coordenadas de boundsLookup).
  const [overlay, setOverlay] = useState<{
    box: { x: number; y: number; w: number; h: number };
    caretX: number;
    caretY: number;
    caretW: number;
    ghost?: { x: number; y: number; r: number } | null; // cabeza fantasma de colocación
  } | null>(null);
  // Paso diatónico del caret en posiciones vacías (línea/espacio donde irá la nota).
  const caretStepRef = useRef<number | null>(null);
  // Cajas rojas sobre compases incompletos (ayuda de edición).
  const [incompleteBoxes, setIncompleteBoxes] = useState<
    { x: number; y: number; w: number; h: number }[]
  >([]);
  // Cajas de resalte sobre los beats de la selección múltiple.
  const [multiBoxes, setMultiBoxes] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  // Y (cliente) del último clic, para fijar el tono según dónde se pincha en el pentagrama.
  const clickClientYRef = useRef<number | null>(null);
  // Figura activa de la barra de herramientas (la que se coloca). Por defecto: negra.
  const [placeDuration, setPlaceDuration] = useState<alphaTab.model.Duration>(
    alphaTab.model.Duration.Quarter,
  );
  const placeDurationRef = useRef(placeDuration);
  useEffect(() => {
    placeDurationRef.current = placeDuration;
  }, [placeDuration]);
  // Puntillo activo (figura con puntillo al colocar).
  const [placeDots, setPlaceDots] = useState(0);
  const placeDotsRef = useRef(placeDots);
  useEffect(() => {
    placeDotsRef.current = placeDots;
  }, [placeDots]);

  // Undo / redo (snapshots JSON del Score)
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const freshLoadRef = useRef(true); // distingue carga nueva de recarga por edición

  // Regiones de paneles (izquierda / derecha / inferior): colapso y tamaño.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(248);
  const [rightWidth, setRightWidth] = useState(248);
  const [bottomHeight, setBottomHeight] = useState(170);

  // Configuración del proyecto (modal del engranaje)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const emptyInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  // El editor de acorde arranca en el modo del acorde actual del beat.
  useEffect(() => {
    const s = parseChordId(selection?.chordId);
    if (s) setChordMode(s.kind === "custom" ? "custom" : "known");
  }, [selection?.chordId]);
  // Mantén el ref de selección múltiple al día y recalcula sus cajas de resalte.
  useEffect(() => {
    multiBeatsRef.current = multiBeats;
    updateMultiBoxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiBeats]);
  useEffect(() => {
    metroOnRef.current = metroOn;
  }, [metroOn]);
  // Al volver de la vista de letra a la partitura, repinta AlphaTab: mientras estuvo
  // oculto (display:none) el render perezoso pudo no pintar los compases visibles.
  useEffect(() => {
    if (view.mode === "score" && hasScore) apiRef.current?.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.mode]);
  // Refresca el overlay de zonas de escala con estado fresco tras renders y cambios.
  useEffect(() => {
    updateScaleOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scalesMode, scaleAssignments, chordNotation, view.mode, postRenderTick]);

  // Re-aplica los colores de notación al cambiar de tema (claro/normal/oscuro).
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    applyScoreTheme(api, theme);
    if (hasScore) api.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ── Crea AlphaTab + metrónomo ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const metro = new MetronomeEngine();
    metroRef.current = metro;

    const api = new alphaTab.AlphaTabApi(containerRef.current, {
      // includeNoteBounds: imprescindible para que `noteMouseDown` se dispare al
      // clicar una nota (AlphaTab solo identifica la nota bajo el cursor si está
      // activo). Sin esto, clicar una nota solo selecciona el beat con una cuerda
      // por defecto → "posición vacía" → ↑↓ no cambiaban la altura.
      core: { fontDirectory: "/assets/alphatab/font/", includeNoteBounds: true },
      player: {
        enablePlayer: true,
        soundFont: "/assets/alphatab/soundfont/sonivox.sf2",
        scrollElement: viewportRef.current ?? undefined,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableUserInteraction: true,
        scrollMode: "Continuous",
        bufferTimeInMilliseconds: 300,
      },
      display: { scale: 1.0, resources: { barNumberColor: "#0f766e" } },
    });
    apiRef.current = api;
    applyScoreTheme(api, theme);
    // Acordes: mostramos el NOMBRE sobre el beat, no el diagrama de cuerdas
    // (no procede en instrumentos melódicos). El nombre se controla por beat.chord.
    api.settings.notation.elements.set(alphaTab.NotationElement.ChordDiagrams, false);
    // Nombre de pista visible y destacado (negrita + mayor tamaño), tanto en la
    // vista como en la exportación a PDF (es parte del render nativo de AlphaTab).
    api.settings.notation.elements.set(alphaTab.NotationElement.TrackNames, true);
    const tnFont = api.settings.display.resources.elementFonts.get(alphaTab.NotationElement.TrackNames);
    if (tnFont) {
      tnFont.size = 15;
      tnFont.weight = alphaTab.model.FontWeight.Bold;
    }
    // Hook de depuración: expone la API y utilidades de edición para tests E2E
    // (Playwright). No afecta a la UX; útil para verificar pitch/render sin píxeles.
    (window as any).__musix = {
      api,
      alphaTab,
      selectNote: (n: Note) => selectNote(n),
      changePitch: (d: 1 | -1) => changePitch(d),
      moveBeat: (d: 1 | -1) => moveBeat(d),
      appendBar: () => appendBarAndSelect(),
      placeNote: () => placeNoteAtCaret(),
      caretStep: () => caretStepRef.current,
      cursor: () => cursorRef.current,
      fullReload: () => {
        const json = alphaTab.model.JsonConverter.scoreToJson(api.score!);
        api.renderScore(alphaTab.model.JsonConverter.jsonToScore(json), [-1]);
      },
    };

    api.scoreLoaded.on((score) => {
      // Muchos ficheros .gp ocultan las dinámicas; en el editor queremos verlas.
      if (score.stylesheet) {
        score.stylesheet.hideDynamics = false;
        // Nombre de pista al comienzo: con una sola pista y en multipista (encima
        // del primer sistema de cada pista). Nombre completo, horizontal.
        const M = alphaTab.model;
        score.stylesheet.singleTrackTrackNamePolicy = M.TrackNamePolicy.FirstSystem;
        score.stylesheet.multiTrackTrackNamePolicy = M.TrackNamePolicy.FirstSystem;
        score.stylesheet.firstSystemTrackNameMode = M.TrackNameMode.FullName;
        score.stylesheet.firstSystemTrackNameOrientation = M.TrackNameOrientation.Horizontal;
      }
      setScoreTitle(score.title || "Sin título");
      setTracks(score.tracks.map((t) => ({ index: t.index, name: t.name || `Pista ${t.index + 1}` })));
      setSelectedTracks(new Set(score.tracks.map((t) => t.index)));
      setTrackPrograms(Object.fromEntries(score.tracks.map((t) => [t.index, t.playbackInfo?.program ?? 0])));
      // Instrumentos: por defecto SF2 con el programa GM de la pista; se respetan
      // las asignaciones guardadas por proyecto (incl. SFZ).
      const saved = loadPrefs(projectId).instruments;
      setTrackInstruments(
        Object.fromEntries(
          score.tracks.map((t) => [
            t.index,
            saved[t.index] ?? { engine: "sf2", program: t.playbackInfo?.program ?? 0 },
          ]),
        ),
      );
      // Prefs embebidas en un fichero Musix recién importado (orden garantizado:
      // se aplican aquí, tras los valores por defecto de la carga).
      const pend = pendingPrefsRef.current;
      if (pend) {
        if (pend.trackColors) setTrackColors(pend.trackColors);
        if (pend.descriptions) setTrackDescriptions(pend.descriptions);
        if (pend.instruments) setTrackInstruments(pend.instruments);
        if (pend.chordNotation) setChordNotation(pend.chordNotation);
        if (typeof pend.playbackPitch === "number") {
          setPlaybackPitch(pend.playbackPitch);
          playbackPitchRef.current = pend.playbackPitch;
        }
        if (pend.scales) setScaleAssignments(pend.scales);
        pendingPrefsRef.current = null;
      }
      setHasScore(true);
      onScoreLoadedChange?.(true);
      setTrackVolumes({}); // por pista vuelve a 100% al cargar
      setSelection(null);
      setOverlay(null);
      setPlayedBeat(null);
      cursorRef.current = { beat: null, string: 3 };

      const bounds: number[] = [0];
      let acc = 0;
      for (const mb of score.masterBars) {
        acc += mb.calculateDuration();
        bounds.push(acc);
      }
      barBoundsRef.current = bounds;
      metro.tempo = score.tempo || 120;
      metro.numerator = score.masterBars[0]?.timeSignatureNumerator || 4;

      if (freshLoadRef.current) {
        setDirty(false);
        undoRef.current = [];
        redoRef.current = [];
        setUndoCount(0);
        setRedoCount(0);
      }
    });

    api.playerReady.on(() => {
      setReady(true);
      api.masterVolume = masterVolRef.current;
      // Reaplica el pitch global de reproducción (transposición de player, no toca notación).
      if (playbackPitchRef.current !== 0 && api.score) {
        api.changeTrackTranspositionPitch(api.score.tracks, playbackPitchRef.current);
      }
    });
    api.playerStateChanged.on((e) => {
      const isPlaying = e.state === alphaTab.synth.PlayerState.Playing;
      setPlaying(isPlaying);
      if (isPlaying && metroOnRef.current) startMetro();
      else metroRef.current?.stop();
    });
    // Beat actualmente sonando → resaltado en la vista de letra (verso + pulso/acorde).
    api.playedBeatChanged.on((beat) => setPlayedBeat(beat));
    api.noteMouseDown.on((note) => {
      if (editModeRef.current) selectNote(note);
    });
    api.beatMouseDown.on((beat) => {
      if (!editModeRef.current) return;
      dragStartRef.current = beat;
      setMultiBeats([]); // un clic simple reinicia la selección múltiple
      selectBeat(beat);
    });
    // Arrastre sobre beats → selección múltiple (desde el beat inicial hasta el actual).
    api.beatMouseMove.on((beat) => {
      if (!editModeRef.current || !draggingRef.current || !dragStartRef.current) return;
      if (beat === dragStartRef.current) {
        if (multiBeatsRef.current.length) setMultiBeats([]);
        return;
      }
      setMultiBeats(beatsBetween(dragStartRef.current, beat));
    });
    // Captura la Y del clic (fase de captura, antes que AlphaTab) para poder fijar el
    // tono según la altura donde se pincha en el pentagrama (líneas/espacios).
    const onDown = (e: MouseEvent) => {
      clickClientYRef.current = e.clientY;
      draggingRef.current = true;
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    containerRef.current.addEventListener("mousedown", onDown, true);
    window.addEventListener("mouseup", onUp);
    api.postRenderFinished.on(() => {
      updateCursorOverlay();
      updateIncompleteOverlay();
      updateMultiBoxes();
      setPostRenderTick((n) => n + 1);
      // Restaura el scroll tras un re-render por edición y lo "fija" durante unos
      // frames: el lazy-loading renderiza chunks después del postRenderFinished y
      // puede empujar el contenido, así que reafirmamos la posición varias veces.
      const save = scrollSaveRef.current;
      if (save && viewportRef.current) {
        pinScroll(save.top, save.left);
        scrollSaveRef.current = null;
      }
    });

    const container = containerRef.current;
    return () => {
      container?.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mouseup", onUp);
      metro.dispose();
      api.destroy();
      apiRef.current = null;
      metroRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carga desde fichero / formato propio.
  useEffect(() => {
    if (apiRef.current && source && !scoreData) {
      freshLoadRef.current = true;
      setReady(false);
      apiRef.current.load(new Uint8Array(source));
    }
  }, [source, scoreData]);
  useEffect(() => {
    if (apiRef.current && scoreData && Object.keys(scoreData).length > 0) {
      freshLoadRef.current = true;
      setReady(false);
      apiRef.current.renderScore(alphaTab.model.JsonConverter.jsonToScore(JSON.stringify(scoreData)));
    }
  }, [scoreData]);

  // Ajustes de vista.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !hasScore) return;
    const d = api.settings.display;
    d.layoutMode = alphaTab.LayoutMode.Page;
    d.barsPerRow = view.alignment === "ordered" ? view.barsPerRow : -1;
    api.updateSettings();
    api.render();
  }, [view, hasScore]);
  // Persistencia de vista y disposición (sobreviven a recargas).
  useEffect(() => saveView(view), [view]);
  useEffect(() => saveLayout(layout), [layout]);
  useEffect(() => {
    try {
      localStorage.setItem(
        prefsKey(projectId),
        JSON.stringify({ trackColors, chordNotation, instruments: trackInstruments, descriptions: trackDescriptions, playbackPitch, scales: scaleAssignments }),
      );
    } catch {
      /* ignore */
    }
  }, [trackColors, chordNotation, trackInstruments, trackDescriptions, playbackPitch, scaleAssignments, projectId]);
  // Catálogo de instrumentos (SFZ disponibles en el servidor) una vez. Solo para
  // cuentas con acceso a render; el resto no puede seleccionar instrumentos.
  useEffect(() => {
    if (!canRenderAudio) {
      setSfzCatalog([]);
      return;
    }
    api.listInstruments().then((c) => setSfzCatalog(c.sfz)).catch(() => setSfzCatalog([]));
  }, [canRenderAudio]);
  // Al recolocar bloques cambia el ancho del lienzo: re-renderiza para reflujo.
  useEffect(() => {
    const api = apiRef.current;
    if (api && hasScore) api.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.placement.tools, layout.placement.tracks]);

  // Metrónomo al día.
  useEffect(() => {
    if (metroRef.current) {
      metroRef.current.subdivision = metroCfg.subdivision;
      metroRef.current.accent = metroCfg.accent;
    }
  }, [metroCfg]);
  useEffect(() => {
    if (metroRef.current) metroRef.current.speed = speed;
  }, [speed]);

  function startMetro() {
    metroRef.current?.start();
  }

  // ── Reproducción / navegación ──────────────────────────────────
  const playPause = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    // El audio se regenera de forma diferida (no en cada edición) para no
    // sacudir el reproductor; lo ponemos al día justo antes de reproducir.
    if (midiDirtyRef.current) {
      try {
        api.loadMidiForScore();
      } catch (err) {
        console.error("[edit] loadMidiForScore", err);
      }
      midiDirtyRef.current = false;
    }
    api.playPause();
  }, []);
  function changeSpeed(value: number) {
    const v = clampSpeed(value);
    setSpeed(v);
    if (apiRef.current) apiRef.current.playbackSpeed = v;
  }
  function toggleMetronome() {
    setMetroOn((on) => {
      const next = !on;
      if (next && playing) startMetro();
      if (!next) metroRef.current?.stop();
      return next;
    });
  }
  function toggleLoop() {
    setLooping((l) => {
      const next = !l;
      if (apiRef.current) apiRef.current.isLooping = next;
      return next;
    });
  }
  function changeZoom(delta: number) {
    const next = Math.min(2, Math.max(0.5, Math.round((zoom + delta) * 100) / 100));
    setZoom(next);
    const api = apiRef.current;
    if (!api) return;
    api.settings.display.scale = next;
    api.updateSettings();
    api.render();
  }
  function seekBars(dir: 1 | -1) {
    const api = apiRef.current;
    const bounds = barBoundsRef.current;
    if (!api || bounds.length === 0) return;
    const cur = api.tickPosition;
    if (dir > 0) {
      const next = bounds.find((b) => b > cur + 1);
      if (next != null) api.tickPosition = next;
    } else {
      const prevs = bounds.filter((b) => b < cur - 1);
      api.tickPosition = prevs.length ? prevs[prevs.length - 1] : 0;
    }
  }

  // ── Undo / redo ────────────────────────────────────────────────
  function currentJson(): string | null {
    const api = apiRef.current;
    return api?.score ? alphaTab.model.JsonConverter.scoreToJson(api.score) : null;
  }
  function snapshot() {
    const j = currentJson();
    if (!j) return;
    undoRef.current.push(j);
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
    setUndoCount(undoRef.current.length);
    setRedoCount(0);
  }
  function loadSnapshot(json: string) {
    const api = apiRef.current;
    if (!api) return;
    freshLoadRef.current = false;
    try {
      api.renderScore(alphaTab.model.JsonConverter.jsonToScore(json));
      midiDirtyRef.current = true;
    } catch (err) {
      console.error("[edit] loadSnapshot", err);
    }
    setDirty(true);
  }
  function undo() {
    const cur = currentJson();
    if (!undoRef.current.length || !cur) return;
    redoRef.current.push(cur);
    loadSnapshot(undoRef.current.pop() as string);
    setUndoCount(undoRef.current.length);
    setRedoCount(redoRef.current.length);
  }
  function redo() {
    const cur = currentJson();
    if (!redoRef.current.length || !cur) return;
    undoRef.current.push(cur);
    loadSnapshot(redoRef.current.pop() as string);
    setUndoCount(undoRef.current.length);
    setRedoCount(redoRef.current.length);
  }

  // ── Edición (cursor: compás + cuerda) ──────────────────────────
  function maxStrings(beat: Beat | null): number {
    const n = (beat as any)?.voice?.bar?.staff?.tuning?.length;
    return typeof n === "number" && n > 0 ? n : 6;
  }
  function noteAt(beat: Beat | null, string: number): Note | null {
    return (beat?.notes?.find((n) => n.string === string) as Note | undefined) ?? null;
  }
  // ¿Pentagrama con altura (no percusión)? La colocación por línea/espacio solo
  // tiene sentido en pentagramas tonales.
  function isPitched(beat: Beat): boolean {
    return (beat as any).voice?.bar?.clef !== alphaTab.model.Clef.Neutral;
  }
  // Ancla la posición vertical en una nota REAL del mismo sistema (misma fila): nos
  // da (Y absoluta, paso diatónico) sin tener que calcular la geometría de la clave.
  // Devuelve también el medio-interlineado (alto del pentagrama / 8).
  function systemAnchor(beat: Beat): { y: number; step: number; half: number } | null {
    const bl = (apiRef.current as any)?.renderer?.boundsLookup;
    const bar = (beat as any).voice?.bar;
    const staff = bar?.staff;
    if (!bl || !staff) return null;
    const self = bl.findBeat(beat);
    if (!self) return null;
    const rowY = self.barBounds.visualBounds.y;
    const keySig = bar.keySignature as number;
    const dispT = staff.displayTranspositionPitch as number;
    for (const b of staff.bars) {
      for (const v of b.voices) {
        for (const bt of v.beats) {
          if (!bt.notes?.length) continue;
          const bb = bl.findBeat(bt);
          if (!bb?.notes || bb.barBounds.visualBounds.y !== rowY) continue;
          const nb = bb.notes[0];
          const displayMidi = nb.note.realValue - dispT;
          return {
            y: nb.noteHeadBounds.y + nb.noteHeadBounds.h / 2,
            step: diatonicStepFromMidi(displayMidi, keySig),
            half: self.barBounds.visualBounds.h / 8,
          };
        }
      }
    }
    return null;
  }
  // Paso diatónico por defecto del caret en una posición vacía: el de la nota previa
  // (continuidad melódica) o, si no hay, el centro del sistema/ancla.
  function defaultCaretStep(beat: Beat, anchor: { step: number } | null): number {
    const staff = (beat as any).voice?.bar?.staff;
    const keySig = (beat as any).voice?.bar?.keySignature as number;
    const dispT = staff?.displayTranspositionPitch ?? 0;
    const voiceIdx = (beat as any).voice?.index ?? 0;
    // recorre hacia atrás beats del mismo voice (este compás y anteriores)
    let bar = (beat as any).voice?.bar;
    let beats: Beat[] = bar?.voices?.[voiceIdx]?.beats ?? [];
    let idx = (beat as any).index - 1;
    while (bar) {
      for (let i = idx; i >= 0; i--) {
        const prev = beats[i];
        if (prev?.notes?.length) {
          return diatonicStepFromMidi(prev.notes[0].realValue - dispT, keySig);
        }
      }
      bar = bar.previousBar;
      beats = bar?.voices?.[voiceIdx]?.beats ?? [];
      idx = beats.length - 1;
    }
    return anchor?.step ?? 0;
  }
  // Información del caret en la posición actual (para etiqueta + overlay).
  function caretInfo(beat: Beat, string: number) {
    const note = noteAt(beat, string);
    const placement = !note && isPitched(beat);
    if (!placement) return { note, placement, displayMidi: null as number | null };
    const anchor = systemAnchor(beat);
    if (caretStepRef.current == null) caretStepRef.current = defaultCaretStep(beat, anchor);
    const keySig = (beat as any).voice?.bar?.keySignature as number;
    return { note, placement, anchor, displayMidi: midiFromDiatonicStep(caretStepRef.current, keySig) };
  }
  function updateSelection() {
    const { beat, string } = cursorRef.current;
    if (!beat) {
      setSelection(null);
      setOverlay(null);
      return;
    }
    const barIndex = (beat as any).voice?.bar?.index;
    const info = caretInfo(beat, string);
    // Nombre de nota = altura ESCRITA (lo que se ve en el pentagrama) = realValue −
    // displayTranspositionPitch. Así el caret y la nota colocada coinciden.
    const dispT = (beat as any).voice?.bar?.staff?.displayTranspositionPitch ?? 0;
    let label: string;
    if (info.placement) label = `colocar · ${midiToName(info.displayMidi!)} · Enter`;
    else if (info.note?.isStringed)
      label = `cuerda ${info.note.string} · traste ${info.note.fret} · ${midiToName(info.note.realValue - dispT)}`;
    else if (info.note) label = midiToName(info.note.realValue - dispT);
    else label = "posición vacía";
    const bar = (beat as any).voice?.bar;
    const mb = bar?.masterBar;
    setSelection({
      bar: typeof barIndex === "number" ? barIndex + 1 : null,
      label,
      hasBeat: true,
      hasNote: !!info.note,
      dynamics: beat.dynamics as unknown as number,
      triplet: beat.hasTuplet,
      tie: !!info.note?.isTieDestination || !!(info.note as any)?.isTieOrigin,
      dots: beat.dots ?? 0,
      crescendo: beat.crescendo as unknown as number,
      clef: bar?.clef ?? 0,
      keySig: bar?.keySignature ?? 0,
      timeNum: mb?.timeSignatureNumerator ?? 4,
      timeDen: mb?.timeSignatureDenominator ?? 4,
      repeatStart: !!mb?.isRepeatStart,
      repeatEnd: !!mb?.isRepeatEnd,
      endings: mb?.alternateEndings ?? 0,
      direction: mb?.directions ? ((Array.from(mb.directions as Set<number>)[0] ?? null) as number | null) : null,
      track: bar?.staff?.track?.index ?? -1,
      text: beat.text ?? "",
      lyric: beat.lyrics?.[0] ?? "",
      chordId: beat.chordId ?? null,
      beatId: (beat as any).id ?? -1,
      section: mb?.section?.text ?? "",
    });
    updateCursorOverlay();
  }
  // Marca en rojo los compases que no completan sus pulsos (sobre la pista renderizada).
  function updateIncompleteOverlay() {
    const api = apiRef.current;
    const bl = (api as any)?.renderer?.boundsLookup;
    const track = api?.tracks?.[0];
    const staff = track?.staves?.[0];
    if (!api || !bl || !staff) {
      setIncompleteBoxes([]);
      return;
    }
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const bar of staff.bars) {
      const fb = bar.voices?.[0]?.beats?.[0];
      if (!fb) continue;
      const bb = bl.findBeat(fb);
      if (!bb) continue; // no renderizado (lazy)
      if (!isBarComplete(bar, 0)) {
        const vb = bb.barBounds.visualBounds;
        boxes.push({ x: vb.x, y: vb.y, w: vb.w, h: vb.h });
      }
    }
    setIncompleteBoxes(boxes);
  }
  // Dibuja el cursor: caja sobre el beat + caret/nota o cabeza fantasma de colocación.
  function updateCursorOverlay() {
    const api = apiRef.current;
    const beat = cursorRef.current.beat;
    const bl = (api as any)?.renderer?.boundsLookup;
    if (!api || !beat || !bl) {
      setOverlay(null);
      return;
    }
    const bb = bl.findBeat(beat);
    if (!bb) {
      setOverlay(null);
      return;
    }
    const staff = bb.barBounds.visualBounds;
    const vb = bb.visualBounds;
    const info = caretInfo(beat, cursorRef.current.string);
    let ghost: { x: number; y: number; r: number } | null = null;
    let caretY = staff.y + staff.h / 2; // 3ª línea por defecto
    if (info.note) {
      caretY = vb.y + vb.h / 2;
    } else if (info.placement && info.anchor && caretStepRef.current != null) {
      const a = info.anchor;
      const gy = a.y - (caretStepRef.current - a.step) * a.half;
      caretY = gy;
      ghost = { x: vb.x + vb.w / 2, y: gy, r: a.half };
    }
    setOverlay({
      box: { x: vb.x, y: staff.y, w: Math.max(vb.w, 6), h: staff.h },
      caretX: vb.x - 2,
      caretY,
      caretW: Math.max(vb.w, 14) + 4,
      ghost,
    });
  }
  function selectNote(note: Note) {
    caretStepRef.current = null;
    cursorRef.current = { beat: note.beat, string: note.string };
    updateSelection();
  }
  function selectBeat(beat: Beat) {
    caretStepRef.current = null;
    let s = Math.min(Math.max(cursorRef.current.string, 1), maxStrings(beat));
    // Si la cuerda actual está vacía pero el beat tiene notas, salta a una nota
    // real (la primera) para que el cursor caiga sobre algo editable, no en
    // "posición vacía". Mejora clicar un compás sin acertar la cabeza exacta.
    if (!noteAt(beat, s) && beat.notes?.length) s = beat.notes[0].string;
    cursorRef.current = { beat, string: s };
    // En posición de colocación, el tono lo fija la ALTURA del clic (línea/espacio).
    if (!noteAt(beat, s) && isPitched(beat) && clickClientYRef.current != null) {
      const anchor = systemAnchor(beat);
      const wrap = containerRef.current?.parentElement;
      if (anchor && wrap) {
        const canvasY = clickClientYRef.current - wrap.getBoundingClientRect().top;
        caretStepRef.current = Math.round(anchor.step + (anchor.y - canvasY) / anchor.half);
      }
    }
    clickClientYRef.current = null;
    updateSelection();
  }
  // Tras una edición: recalcula (finish) y re-renderiza. Usamos el RENDER PARCIAL
  // de AlphaTab: con `firstChangedMasterBar` solo se re-maqueta desde ese compás y
  // con `reuseViewport` se reutilizan los chunks del DOM ya pintados → sin parpadeo
  // ni salto de scroll. El audio se regenera de forma diferida (hasta pulsar play).
  // Reafirma la posición de scroll durante ~6 frames tras una edición, para
  // contrarrestar el reflow que provoca el lazy-loading de chunks posteriores.
  function pinScroll(top: number, left: number) {
    const vp = viewportRef.current;
    if (!vp) return;
    let n = 0;
    const tick = () => {
      if (!viewportRef.current) return;
      viewportRef.current.scrollTop = top;
      viewportRef.current.scrollLeft = left;
      if (++n < 6) requestAnimationFrame(tick);
    };
    tick();
  }
  // `full`: render completo (reconstruye TODO el boundsLookup). Necesario en cambios
  // ESTRUCTURALES (añadir/quitar compases): el render parcial con `firstChangedMasterBar`
  // solo limpia el lookup desde ese compás, pero si el compás es nuevo cae a re-layout
  // completo dejando bounds viejos → `findBeat` devolvería posiciones erróneas.
  function refresh(changedBeat?: Beat | null, opts?: { full?: boolean }) {
    const api = apiRef.current;
    if (!api?.score) return;
    const vp = viewportRef.current;
    if (vp) scrollSaveRef.current = { top: vp.scrollTop, left: vp.scrollLeft };
    const beat = changedBeat ?? cursorRef.current.beat;
    const barIdx = (beat as any)?.voice?.bar?.masterBar?.index;
    try {
      api.score.finish(api.settings);
      if (!opts?.full && typeof barIdx === "number" && barIdx >= 0) {
        api.render({ firstChangedMasterBar: barIdx, reuseViewport: true });
      } else {
        api.render();
      }
      midiDirtyRef.current = true;
    } catch (err) {
      console.error("[edit] refresh", err);
    }
    setDirty(true);
  }
  function setFret(value: number) {
    const { beat, string } = cursorRef.current;
    if (!beat) return;
    snapshot();
    const v = clampFret(value);
    const existing = noteAt(beat, string);
    if (existing) {
      existing.fret = v;
    } else {
      const note = new alphaTab.model.Note();
      note.id = maxNoteId() + 1;
      note.string = string;
      note.fret = v;
      if (beat.isRest) {
        beat.duration = placeDurationRef.current; // figura elegida
        beat.dots = placeDotsRef.current;
      }
      try {
        beat.addNote(note);
      } catch (err) {
        console.error("[edit] addNote", err);
        return;
      }
    }
    updateSelection();
    refresh();
  }
  function fretDigit(d: number) {
    if (!cursorRef.current.beat) return;
    const now = Date.now();
    const buf = fretBufRef.current;
    const combined = now - buf.t < 900 ? buf.value * 10 + d : d;
    const v = combined <= MAX_FRET ? combined : d;
    fretBufRef.current = { value: v, t: now };
    setFret(v);
  }
  // Supr: sobre una NOTA la quita (si era la única, el beat queda en silencio).
  // Sobre un SILENCIO, elimina la posición (el beat), salvo que sea el único del compás.
  function deleteAtCursor() {
    const { beat, string } = cursorRef.current;
    if (!beat) return;
    const note = noteAt(beat, string);
    snapshot();
    if (note) {
      try {
        beat.removeNote(note);
      } catch (err) {
        console.error("[edit] removeNote", err);
      }
      updateSelection();
      refresh(beat);
      return;
    }
    // silencio → eliminar la posición
    const voice = (beat as any).voice;
    const beats: Beat[] = voice?.beats ?? [];
    if (beats.length <= 1) {
      // único beat del compás: no dejamos el compás sin posiciones
      undoRef.current.pop(); // descarta el snapshot (no hubo cambio)
      setUndoCount(undoRef.current.length);
      return;
    }
    const idx = (beat as any).index;
    beats.splice(idx, 1);
    beats.forEach((b, i) => (b.index = i));
    caretStepRef.current = null;
    cursorRef.current = { beat: beats[Math.max(0, idx - 1)], string };
    updateSelection();
    refresh(undefined, { full: true }); // cambio estructural
  }
  // ↑↓: sobre una NOTA cambian el tono ±1 semitono (cuerda→traste, estándar→octave/
  // tone). Sobre una posición VACÍA mueven el caret por paso diatónico (línea↔espacio)
  // mostrando la cabeza fantasma; Enter coloca la nota a esa altura.
  function changePitch(delta: 1 | -1) {
    const { beat, string } = cursorRef.current;
    if (!beat) return;
    const note = noteAt(beat, string);
    if (!note) {
      if (isPitched(beat)) moveCaretStep(delta);
      return;
    }
    snapshot();
    if (note.isStringed) {
      note.fret = clampFret(note.fret + delta);
    } else {
      const midi = note.octave * 12 + note.tone + delta;
      note.octave = Math.floor(midi / 12);
      note.tone = ((midi % 12) + 12) % 12;
    }
    updateSelection();
    refresh();
  }
  // Mueve el caret de colocación por paso diatónico (no altera el modelo).
  function moveCaretStep(delta: 1 | -1) {
    if (caretStepRef.current == null) caretStepRef.current = defaultCaretStep(cursorRef.current.beat!, systemAnchor(cursorRef.current.beat!));
    caretStepRef.current += delta;
    updateSelection();
  }
  // IDs únicos para elementos nuevos. La deserialización conserva los ids del fichero
  // (que llegan más alto que el contador interno de AlphaTab), así que `new Beat()`/
  // `new Note()` reciben ids que COLISIONAN con los existentes → el boundsLookup
  // (indexado por id) devuelve posiciones erróneas. Asignamos ids por encima del máximo.
  function maxBeatId(): number {
    let m = -1;
    const s = apiRef.current?.score;
    if (s)
      for (const t of s.tracks) for (const st of t.staves) for (const b of st.bars) for (const v of b.voices) for (const bt of v.beats) if (bt.id > m) m = bt.id;
    return m;
  }
  function maxNoteId(): number {
    let m = -1;
    const s = apiRef.current?.score;
    if (s)
      for (const t of s.tracks) for (const st of t.staves) for (const b of st.bars) for (const v of b.voices) for (const bt of v.beats) for (const n of bt.notes) if (n.id > m) m = n.id;
    return m;
  }
  // Coloca una nota en el beat actual a la altura del caret. En pentagrama de cuerda
  // elige la cuerda (preferente la del cursor) y calcula el traste; si no hay, octave/tone.
  function placeNoteAtCaret() {
    const { beat, string } = cursorRef.current;
    if (!beat || noteAt(beat, string) || !isPitched(beat)) return;
    const bar = (beat as any).voice.bar;
    const staff = bar.staff;
    const keySig = bar.keySignature as number;
    if (caretStepRef.current == null) caretStepRef.current = defaultCaretStep(beat, systemAnchor(beat));
    const realValue = midiFromDiatonicStep(caretStepRef.current, keySig) + (staff.displayTranspositionPitch ?? 0);
    snapshot();
    const note = new alphaTab.model.Note();
    note.id = maxNoteId() + 1;
    const tuning: number[] = staff.tuning ?? [];
    if (tuning.length > 0) {
      // realValue = fret + stringTuning - transpositionPitch  →  fret = realValue - stringTuning + transp
      const transp = staff.transpositionPitch ?? 0;
      const tuningOf = (s: number) => tuning[tuning.length - s];
      const pref = Math.min(Math.max(string, 1), tuning.length);
      let chosen = -1;
      let chosenFret = -1;
      // prioriza la cuerda del cursor; si el traste no es válido, busca otra (traste menor)
      for (const s of [pref, ...Array.from({ length: tuning.length }, (_, i) => i + 1)]) {
        const f = realValue - tuningOf(s) + transp;
        if (f >= 0 && f <= MAX_FRET) {
          if (chosen === -1 || f < chosenFret) {
            chosen = s;
            chosenFret = f;
          }
          if (s === pref) break; // la del cursor tiene prioridad si es válida
        }
      }
      if (chosen === -1) return; // fuera del rango del instrumento
      note.string = chosen;
      note.fret = chosenFret;
    } else {
      note.octave = Math.floor(realValue / 12);
      note.tone = ((realValue % 12) + 12) % 12;
    }
    beat.duration = placeDurationRef.current; // figura elegida en la barra (no redonda)
    beat.dots = placeDotsRef.current;
    try {
      beat.addNote(note);
    } catch (err) {
      console.error("[edit] placeNote", err);
      return;
    }
    cursorRef.current = { beat, string: note.string >= 0 ? note.string : string };
    caretStepRef.current = null;
    updateSelection();
    refresh(beat);
  }
  // Añade un compás vacío al final de la partitura: un MasterBar (hereda compás/
  // tonalidad del último) + un Bar por cada staff de cada pista, con tantas voces
  // como el último compás, cada una con un beat vacío (silencio de compás completo).
  // Devuelve el primer beat del nuevo compás en la voz indicada (para navegar a él).
  function appendBar(voiceIndex = 0): Beat | null {
    const api = apiRef.current;
    const score = api?.score;
    if (!score || score.masterBars.length === 0) return null;
    const M = alphaTab.model;
    const lastMb = score.masterBars[score.masterBars.length - 1];
    const mb = new M.MasterBar();
    mb.timeSignatureNumerator = lastMb.timeSignatureNumerator;
    mb.timeSignatureDenominator = lastMb.timeSignatureDenominator;
    mb.timeSignatureCommon = lastMb.timeSignatureCommon;
    mb.tripletFeel = lastMb.tripletFeel;
    score.addMasterBar(mb);

    let nextBeatId = maxBeatId() + 1;
    let firstBeatInVoice: Beat | null = null;
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        const prev = staff.bars[staff.bars.length - 1];
        const bar = new M.Bar();
        if (prev) {
          bar.clef = prev.clef;
          bar.clefOttava = prev.clefOttava;
          bar.keySignature = prev.keySignature;
          bar.keySignatureType = prev.keySignatureType;
        }
        const voiceCount = Math.max(1, prev?.voices.length ?? 1);
        for (let v = 0; v < voiceCount; v++) {
          const voice = new M.Voice();
          // Silencio de compás completo (como Guitar Pro): un beat de silencio con
          // duración de redonda → AlphaTab lo dibuja como silencio centrado de compás.
          const beat = new M.Beat();
          beat.id = nextBeatId++; // id único (evita colisión con beats del fichero)
          beat.duration = M.Duration.Whole;
          voice.addBeat(beat);
          bar.addVoice(voice);
          if (v === voiceIndex) firstBeatInVoice = beat;
        }
        staff.addBar(bar);
      }
    }
    return firstBeatInVoice;
  }
  // Crea un compás al final y deja el cursor en su primer beat.
  function appendBarAndSelect() {
    const voiceIdx = (cursorRef.current.beat as any)?.voice?.index ?? 0;
    snapshot();
    const beat = appendBar(voiceIdx);
    if (!beat) return;
    cursorRef.current = { beat, string: cursorRef.current.string };
    updateSelection();
    refresh(beat, { full: true }); // cambio estructural → render completo
  }
  // Re-enlaza masterBars y bars (índices, prev/next) y reconstruye los grupos de
  // repetición tras una inserción/eliminación. `Score.finish` NO hace esto, así que
  // lo hacemos a mano antes de refrescar (que llama a finish).
  function relinkBars(score: alphaTab.model.Score) {
    const mbs = score.masterBars;
    mbs.forEach((mb, i) => {
      mb.index = i;
      mb.previousMasterBar = i > 0 ? mbs[i - 1] : null;
      mb.nextMasterBar = i < mbs.length - 1 ? mbs[i + 1] : null;
    });
    (score as any).rebuildRepeatGroups?.();
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        staff.bars.forEach((bar, i) => {
          bar.index = i;
          bar.previousBar = i > 0 ? staff.bars[i - 1] : null;
          bar.nextBar = i < staff.bars.length - 1 ? staff.bars[i + 1] : null;
        });
      }
    }
  }
  // Inserta un compás vacío en la posición `index` (0..len). Copia métrica/clave/
  // armadura del compás de referencia. Devuelve el masterBar nuevo, ya enlazado.
  function insertMasterBarAt(index: number): alphaTab.model.MasterBar | null {
    const score = apiRef.current?.score;
    if (!score || score.masterBars.length === 0) return null;
    const M = alphaTab.model;
    const at = Math.max(0, Math.min(index, score.masterBars.length));
    const ref = score.masterBars[Math.min(at, score.masterBars.length - 1)];
    const mb = new M.MasterBar();
    mb.score = score; // lo asigna addMasterBar; aquí insertamos a mano
    mb.timeSignatureNumerator = ref.timeSignatureNumerator;
    mb.timeSignatureDenominator = ref.timeSignatureDenominator;
    mb.timeSignatureCommon = ref.timeSignatureCommon;
    mb.tripletFeel = ref.tripletFeel;
    score.masterBars.splice(at, 0, mb);

    let nextBeatId = maxBeatId() + 1;
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        const refBar = staff.bars[Math.min(at, staff.bars.length - 1)];
        const bar = new M.Bar();
        bar.staff = staff; // lo asigna addBar; aquí insertamos a mano
        if (refBar) {
          bar.clef = refBar.clef;
          bar.clefOttava = refBar.clefOttava;
          bar.keySignature = refBar.keySignature;
          bar.keySignatureType = refBar.keySignatureType;
        }
        const voiceCount = Math.max(1, refBar?.voices.length ?? 1);
        for (let v = 0; v < voiceCount; v++) {
          const voice = new M.Voice();
          const beat = new M.Beat();
          beat.id = nextBeatId++;
          beat.duration = M.Duration.Whole;
          voice.addBeat(beat);
          bar.addVoice(voice);
        }
        staff.bars.splice(at, 0, bar);
      }
    }
    relinkBars(score);
    return mb;
  }
  // Inserta un compás antes/después del compás actual y deja el cursor en su 1er beat.
  function insertBarRelative(where: "before" | "after") {
    const bar = (cursorRef.current.beat as any)?.voice?.bar;
    const score = apiRef.current?.score;
    if (!bar || !score) return;
    const voiceIdx = (cursorRef.current.beat as any)?.voice?.index ?? 0;
    const at = where === "before" ? bar.index : bar.index + 1;
    snapshot();
    const mb = insertMasterBarAt(at);
    if (!mb) return;
    // Cursor al primer beat del compás nuevo en la pista/voz actual.
    const trackIdx = bar.staff?.track?.index ?? 0;
    const staffIdx = bar.staff?.index ?? 0;
    const newBar = score.tracks[trackIdx]?.staves[staffIdx]?.bars[at];
    const beat = newBar?.voices[voiceIdx]?.beats[0] ?? newBar?.voices[0]?.beats[0] ?? null;
    if (beat) cursorRef.current = { beat, string: cursorRef.current.string };
    updateSelection();
    refresh(beat, { full: true });
  }
  // Elimina el compás actual de TODAS las pistas (mínimo un compás en la partitura).
  function deleteCurrentBar() {
    const bar = (cursorRef.current.beat as any)?.voice?.bar;
    const score = apiRef.current?.score;
    if (!bar || !score || score.masterBars.length <= 1) return;
    const at = bar.index;
    snapshot();
    score.masterBars.splice(at, 1);
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        if (staff.bars.length > at) staff.bars.splice(at, 1);
      }
    }
    relinkBars(score);
    // Cursor al primer beat del compás que ocupa ahora esa posición (o el anterior).
    const trackIdx = bar.staff?.track?.index ?? 0;
    const staffIdx = bar.staff?.index ?? 0;
    const bars = score.tracks[trackIdx]?.staves[staffIdx]?.bars ?? [];
    const target = bars[Math.min(at, bars.length - 1)];
    const beat = target?.voices[0]?.beats[0] ?? null;
    cursorRef.current = { beat, string: cursorRef.current.string };
    updateSelection();
    refresh(beat, { full: true });
  }
  // "Heredar" (quitar cambio): devuelve clave/armadura/métrica del compás actual al
  // valor del compás anterior, fusionando el cambio. No procede en el primer compás.
  function inheritClef() {
    const prev = (cursorRef.current.beat as any)?.voice?.bar?.previousBar;
    if (prev) setClef(prev.clef);
  }
  function inheritKeySignature() {
    const prev = (cursorRef.current.beat as any)?.voice?.bar?.previousBar;
    if (prev) setKeySignature(prev.keySignature as unknown as number);
  }
  function inheritTimeSignature() {
    const prev = (cursorRef.current.beat as any)?.voice?.bar?.masterBar?.previousMasterBar;
    if (prev) setTimeSignature(prev.timeSignatureNumerator, prev.timeSignatureDenominator);
  }
  // ¿El compás (voz) tiene ya los pulsos necesarios para su métrica?
  function isBarComplete(bar: any, voiceIdx: number): boolean {
    const capacity = bar?.masterBar?.calculateDuration(false) ?? 0;
    const beats: Beat[] = bar?.voices?.[voiceIdx]?.beats ?? [];
    const content = beats.reduce((s, b) => s + (b.playbackDuration || 0), 0);
    return capacity > 0 && content >= capacity;
  }
  // Inserta una posición de silencio (con la figura activa) después de `beat`.
  function insertRestAfter(beat: Beat): Beat {
    const voice = (beat as any).voice;
    const rest = new alphaTab.model.Beat();
    rest.id = maxBeatId() + 1;
    rest.duration = placeDurationRef.current;
    voice.insertBeat(beat, rest);
    voice.beats.forEach((b: Beat, i: number) => (b.index = i));
    return rest;
  }
  function moveBeat(dir: 1 | -1) {
    const { beat, string } = cursorRef.current;
    const voice = (beat as any)?.voice;
    const beats = voice?.beats;
    if (!beat || !beats) return;
    const idx = (beat as any).index;
    let target = beats[idx + dir] as Beat | undefined;
    if (target) {
      caretStepRef.current = null;
      cursorRef.current = { beat: target, string };
      updateSelection();
      return;
    }
    // ── Borde del compás ──────────────────────────────────────────
    const bar = voice.bar;
    if (dir < 0) {
      // hacia atrás: último beat del compás anterior
      const prev = bar?.previousBar;
      const pbeats = prev?.voices?.[voice.index ?? 0]?.beats ?? prev?.voices?.[0]?.beats;
      if (pbeats?.length) {
        caretStepRef.current = null;
        cursorRef.current = { beat: pbeats[pbeats.length - 1], string };
        updateSelection();
      }
      return;
    }
    // dir > 0 (→) en el último beat del compás:
    const beatIsEmptyRest = !beat.notes?.length;
    const complete = isBarComplete(bar, voice.index ?? 0);
    // Compás incompleto y la última posición YA tiene contenido → crear una posición
    // más para insertar otra figura (no saltar de compás todavía).
    if (!complete && !beatIsEmptyRest) {
      snapshot();
      const rest = insertRestAfter(beat);
      caretStepRef.current = null;
      cursorRef.current = { beat: rest, string };
      updateSelection();
      refresh(undefined, { full: true });
      return;
    }
    // Completo, o en una posición nueva vacía → ir al siguiente compás (o crearlo).
    const next = bar?.nextBar;
    if (next) {
      const nbeats = next.voices?.[voice.index ?? 0]?.beats ?? next.voices?.[0]?.beats;
      if (nbeats?.length) {
        caretStepRef.current = null;
        cursorRef.current = { beat: nbeats[0], string };
        updateSelection();
      }
      return;
    }
    appendBarAndSelect(); // final de la partitura
  }
  // Elige la figura activa de la barra (la que se coloca). Si hay una nota
  // seleccionada, también le aplica esa figura.
  function chooseDuration(value: alphaTab.model.Duration) {
    setPlaceDuration(value);
    const { beat, string } = cursorRef.current;
    if (beat && noteAt(beat, string)) setDuration(value);
  }
  function setDuration(value: alphaTab.model.Duration) {
    const beat = cursorRef.current.beat;
    if (!beat) return;
    snapshot();
    beat.duration = value;
    refresh();
  }
  function cycleDuration(dir: 1 | -1) {
    const beat = cursorRef.current.beat;
    if (!beat) return;
    const idx = DURATIONS.findIndex((d) => d.value === beat.duration);
    const ni = Math.min(DURATIONS.length - 1, Math.max(0, (idx < 0 ? 2 : idx) + dir));
    setDuration(DURATIONS[ni].value);
  }
  // ── Herramientas: dinámica, tresillo, ligadura, clave, tonalidad, métrica ──────
  function toggleTriplet() {
    const beat = cursorRef.current.beat;
    if (!beat) return;
    snapshot();
    if (beat.hasTuplet) {
      beat.tupletNumerator = -1;
      beat.tupletDenominator = -1;
    } else {
      beat.tupletNumerator = 3;
      beat.tupletDenominator = 2;
    }
    refresh(beat);
  }
  // Liga la nota seleccionada con el siguiente beat: la nota destino (misma cuerda/
  // altura) se marca como destino de ligadura. Si no existe, se crea con la misma altura.
  function toggleTie() {
    const { beat, string } = cursorRef.current;
    const note = noteAt(beat, string);
    if (!beat || !note) return;
    const voice = (beat as any).voice;
    const next = voice?.beats?.[(beat as any).index + 1] as Beat | undefined;
    if (!next) return; // sin beat siguiente no se puede ligar
    snapshot();
    let target = noteAt(next, note.string);
    if (target?.isTieDestination) {
      target.isTieDestination = false; // quitar ligadura
    } else {
      if (!target) {
        target = new alphaTab.model.Note();
        target.id = maxNoteId() + 1;
        target.string = note.string;
        target.fret = note.fret;
        target.octave = note.octave;
        target.tone = note.tone;
        if (next.isRest) next.duration = beat.duration;
        next.addNote(target);
      }
      target.isTieDestination = true;
    }
    refresh(beat);
  }
  // Clave/tonalidad/métrica se propagan de este compás EN ADELANTE hasta el siguiente
  // cambio (convención musical), no solo al compás aislado.
  function setClef(value: alphaTab.model.Clef) {
    const bar = (cursorRef.current.beat as any)?.voice?.bar;
    if (!bar) return;
    snapshot();
    const old = bar.clef;
    for (let b = bar; b && b.clef === old; b = b.nextBar) b.clef = value;
    refresh(cursorRef.current.beat, { full: true });
  }
  function setKeySignature(value: number) {
    const bar = (cursorRef.current.beat as any)?.voice?.bar;
    if (!bar) return;
    snapshot();
    const old = bar.keySignature;
    for (let b = bar; b && b.keySignature === old; b = b.nextBar)
      b.keySignature = value as unknown as alphaTab.model.KeySignature;
    refresh(cursorRef.current.beat, { full: true });
  }
  function setTimeSignature(num: number, den: number) {
    const mb = (cursorRef.current.beat as any)?.voice?.bar?.masterBar;
    if (!mb || num < 1 || den < 1) return;
    snapshot();
    const oN = mb.timeSignatureNumerator;
    const oD = mb.timeSignatureDenominator;
    for (
      let m = mb;
      m && m.timeSignatureNumerator === oN && m.timeSignatureDenominator === oD;
      m = m.nextMasterBar
    ) {
      m.timeSignatureNumerator = num;
      m.timeSignatureDenominator = den;
    }
    refresh(cursorRef.current.beat, { full: true });
  }
  function setCrescendo(value: number) {
    const beat = cursorRef.current.beat;
    if (!beat) return;
    snapshot();
    // toggle: si ya está ese tipo, lo quita
    const cur = beat.crescendo as unknown as number;
    beat.crescendo = (cur === value ? 0 : value) as unknown as alphaTab.model.CrescendoType;
    refresh(beat);
  }
  // Puntillo: cicla 0→1→2→0 en el beat señalado (tecla "." y botón).
  function cycleDots() {
    const beat = cursorRef.current.beat;
    if (!beat) return;
    snapshot();
    beat.dots = (beat.dots + 1) % 3;
    refresh(beat);
  }
  function togglePlaceDot() {
    const next = placeDots ? 0 : 1;
    setPlaceDots(next);
    const { beat, string } = cursorRef.current;
    if (beat && noteAt(beat, string)) {
      snapshot();
      beat.dots = next;
      refresh(beat);
    }
  }
  function toggleRepeatStart() {
    const mb = (cursorRef.current.beat as any)?.voice?.bar?.masterBar;
    if (!mb) return;
    snapshot();
    mb.isRepeatStart = !mb.isRepeatStart;
    refresh(cursorRef.current.beat, { full: true });
  }
  function toggleRepeatEnd() {
    const mb = (cursorRef.current.beat as any)?.voice?.bar?.masterBar;
    if (!mb) return;
    snapshot();
    mb.repeatCount = mb.repeatCount > 0 ? 0 : 2; // 0 = sin fin; 2 = repetir una vez
    refresh(cursorRef.current.beat, { full: true });
  }
  function toggleEnding(bit: number) {
    const mb = (cursorRef.current.beat as any)?.voice?.bar?.masterBar;
    if (!mb) return;
    snapshot();
    mb.alternateEndings = (mb.alternateEndings ?? 0) ^ (1 << bit);
    refresh(cursorRef.current.beat, { full: true });
  }
  function setDirection(value: number | null) {
    const mb = (cursorRef.current.beat as any)?.voice?.bar?.masterBar;
    if (!mb) return;
    snapshot();
    if (value == null) {
      mb.directions = null;
    } else {
      mb.directions = new Set([value as alphaTab.model.Direction]);
    }
    refresh(cursorRef.current.beat, { full: true });
  }

  // ── Texto y acordes por beat ───────────────────────────────────
  // Frase/anotación de texto sobre el beat (beat.text, nativo de AlphaTab).
  function setBeatText(text: string) {
    const beat = cursorRef.current.beat;
    if (!beat) return;
    const trimmed = text.trim();
    if ((beat.text ?? "") === trimmed) return; // sin cambios
    snapshot();
    beat.text = trimmed ? trimmed : null;
    updateSelection();
    bumpLyrics();
    refresh(beat, { full: true });
  }
  // Letra del beat (beat.lyrics, nativo de AlphaTab). Editamos el primer segmento
  // (una sílaba/palabra por pulso); vacío la borra. Se ve tanto en el pentagrama
  // como en la vista de letra.
  function setBeatLyric(text: string) {
    const beat = cursorRef.current.beat;
    if (!beat) return;
    const trimmed = text.trim();
    if ((beat.lyrics?.[0] ?? "") === trimmed) return; // sin cambios
    snapshot();
    beat.lyrics = trimmed ? [trimmed] : null;
    updateSelection();
    bumpLyrics();
    refresh(beat, { full: true });
  }
  // Pista que muestra la vista de letra: en edición, la del beat seleccionado; si no,
  // la que tenga más letra (cae a la primera visible / pista 0).
  function pickLyricsTrack(): alphaTab.model.Track | null {
    const sc = apiRef.current?.score;
    if (!sc?.tracks.length) return null;
    if (editMode && selection && selection.track >= 0 && sc.tracks[selection.track]) {
      return sc.tracks[selection.track];
    }
    let best: alphaTab.model.Track | null = null;
    let bestCount = -1;
    for (const t of sc.tracks) {
      let n = 0;
      for (const bar of t.staves?.[0]?.bars ?? [])
        for (const b of bar.voices?.[0]?.beats ?? []) if (b.lyrics?.[0]) n++;
      if (n > bestCount) {
        bestCount = n;
        best = t;
      }
    }
    if (bestCount > 0) return best;
    const firstVisible = [...selectedTracks].sort((a, b) => a - b)[0];
    return sc.tracks[firstVisible ?? 0] ?? sc.tracks[0];
  }
  // Clic en un pulso de la vista de letra: lo selecciona (para editar con T) y, si no
  // está sonando, sitúa la reproducción en él.
  function pickBeatFromLyrics(beat: Beat) {
    selectBeat(beat);
    const api = apiRef.current;
    if (api && !playing) api.tickPosition = beat.absolutePlaybackStart;
  }
  // Asigna (o quita) un acorde al beat. El acorde se guarda en staff.chords con su
  // id codificado; el nombre mostrado se calcula según la notación actual.
  function applyChord(id: string | null) {
    const beat = cursorRef.current.beat;
    const staff = (beat as any)?.voice?.bar?.staff;
    if (!beat || !staff) return;
    snapshot();
    if (!id) {
      beat.chordId = null;
    } else {
      const name = chordDisplay(id, chordNotation);
      const existing = staff.chords?.get(id);
      if (existing) {
        existing.name = name;
      } else {
        const chord = new alphaTab.model.Chord();
        chord.name = name;
        chord.showName = true;
        chord.showDiagram = false;
        chord.showFingering = false;
        chord.strings = [];
        staff.addChord(id, chord);
      }
      beat.chordId = id;
    }
    updateSelection();
    bumpLyrics();
    refresh(beat, { full: true });
  }
  // Cambia la notación de acordes y reescribe el nombre de TODOS los acordes
  // conocidos de la partitura (los personalizados no se traducen).
  function changeChordNotation(n: ChordNotation) {
    setChordNotation(n);
    const score = apiRef.current?.score;
    if (score) {
      for (const t of score.tracks)
        for (const st of t.staves) {
          if (!st.chords) continue;
          for (const [id, chord] of st.chords) {
            if (parseChordId(id)?.kind === "known") chord.name = chordDisplay(id, n);
          }
        }
      refresh(cursorRef.current.beat, { full: true });
      setDirty(true);
    }
  }

  // ── Cronograma de pistas ───────────────────────────────────────
  const colorOf = (index: number) => trackColors[index] ?? TRACK_PALETTE[index % TRACK_PALETTE.length];
  function setTrackColor(index: number, color: string) {
    setTrackColors((prev) => ({ ...prev, [index]: color }));
  }
  // ¿La pista tiene contenido (alguna nota, no solo silencios) en ese compás?
  function barHasContent(track: alphaTab.model.Track, mbIndex: number): boolean {
    for (const st of track.staves) {
      const bar = st.bars[mbIndex];
      if (!bar) continue;
      for (const v of bar.voices) for (const b of v.beats) if (b.notes?.length) return true;
    }
    return false;
  }

  // ── Selección múltiple (operaciones en lote) ───────────────────
  // Todos los beats del mismo voice entre `a` y `b` (en orden), inclusive.
  function beatsBetween(a: Beat, b: Beat): Beat[] {
    const vi = (a as any).voice?.index ?? 0;
    const ka = [(a as any).voice.bar.index, (a as any).index];
    const kb = [(b as any).voice.bar.index, (b as any).index];
    const [start, end] = ka[0] < kb[0] || (ka[0] === kb[0] && ka[1] <= kb[1]) ? [a, b] : [b, a];
    const sBar = (start as any).voice.bar.index;
    const sIdx = (start as any).index;
    const eBar = (end as any).voice.bar.index;
    const eIdx = (end as any).index;
    const res: Beat[] = [];
    for (let bar = (start as any).voice.bar; bar; bar = bar.nextBar) {
      const beats: Beat[] = bar.voices?.[vi]?.beats ?? bar.voices?.[0]?.beats ?? [];
      for (const bt of beats) {
        const idx = (bt as any).index;
        const afterStart = bar.index > sBar || (bar.index === sBar && idx >= sIdx);
        const beforeEnd = bar.index < eBar || (bar.index === eBar && idx <= eIdx);
        if (afterStart && beforeEnd) res.push(bt);
      }
      if (bar.index >= eBar) break;
    }
    return res;
  }
  function updateMultiBoxes() {
    const bl = (apiRef.current as any)?.renderer?.boundsLookup;
    if (!bl || multiBeats.length < 2) {
      setMultiBoxes([]);
      return;
    }
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const bt of multiBeats) {
      const bb = bl.findBeat(bt);
      if (!bb) continue;
      const sb = bb.barBounds.visualBounds;
      const vb = bb.visualBounds;
      boxes.push({ x: vb.x, y: sb.y, w: Math.max(vb.w, 6), h: sb.h });
    }
    setMultiBoxes(boxes);
  }
  // Beats sobre los que actúa una operación: la selección múltiple o, si no, el cursor.
  function targetBeats(): Beat[] {
    if (multiBeats.length > 1) return multiBeats;
    return cursorRef.current.beat ? [cursorRef.current.beat] : [];
  }
  // Aplica `fn` a cada beat objetivo con un único snapshot y un refresh final.
  function applyToTargets(fn: (b: Beat) => void, full = false) {
    const beats = targetBeats();
    if (!beats.length) return;
    snapshot();
    beats.forEach(fn);
    updateSelection();
    refresh(beats[0], { full });
  }
  // Desplaza la altura de una nota `delta` semitonos (sirve para ±1 y para transponer).
  function shiftNote(note: Note, delta: number) {
    if (note.isStringed) {
      note.fret = clampFret(note.fret + delta);
    } else {
      const midi = note.octave * 12 + note.tone + delta;
      note.octave = Math.floor(midi / 12);
      note.tone = ((midi % 12) + 12) % 12;
    }
  }
  function transposeSelection(delta: 1 | -1) {
    if (multiBeats.length > 1) {
      applyToTargets((b) => b.notes?.forEach((n) => shiftNote(n, delta)));
    } else {
      changePitch(delta); // comportamiento de nota única (incluye mover caret si vacío)
    }
  }
  // Tresillo / dinámica en lote (sobre selección múltiple). En single delega en los toggles.
  function applyTripletAll() {
    applyToTargets((b) => {
      b.tupletNumerator = 3;
      b.tupletDenominator = 2;
    }, true);
  }
  function applyDynamicsAll(value: number) {
    applyToTargets((b) => {
      b.dynamics = value as unknown as alphaTab.model.DynamicValue;
    });
  }
  // Ligadura en lote: liga cada beat con el siguiente del voice.
  function applyTieAll() {
    const beats = targetBeats();
    if (!beats.length) return;
    snapshot();
    for (const beat of beats) {
      const note = beat.notes?.[0];
      const voice = (beat as any).voice;
      const next = voice?.beats?.[(beat as any).index + 1] as Beat | undefined;
      if (!note || !next) continue;
      let target = next.notes?.find((n) => n.string === note.string) ?? null;
      if (!target) {
        target = new alphaTab.model.Note();
        target.id = maxNoteId() + 1;
        target.string = note.string;
        target.fret = note.fret;
        target.octave = note.octave;
        target.tone = note.tone;
        if (next.isRest) next.duration = beat.duration;
        next.addNote(target);
      }
      target.isTieDestination = true;
    }
    updateSelection();
    refresh(beats[0], { full: true });
  }

  // ── Texto, acordes, sección (anotaciones) ──────────────────────
  function setSection(text: string) {
    const mb = (cursorRef.current.beat as any)?.voice?.bar?.masterBar;
    if (!mb) return;
    snapshot();
    const trimmed = text.trim();
    if (!trimmed) {
      mb.section = null;
    } else {
      const s = new alphaTab.model.Section();
      s.text = trimmed;
      s.marker = "";
      mb.section = s;
    }
    updateSelection();
    bumpLyrics();
    refresh(cursorRef.current.beat, { full: true });
  }

  useShortcuts({
    onPlayPause: playPause,
    onSpeedUp: () => (editMode ? cycleDuration(1) : changeSpeed(speed + SPEED_STEP)),
    onSpeedDown: () => (editMode ? cycleDuration(-1) : changeSpeed(speed - SPEED_STEP)),
    onArrowLeft: () => (editMode ? moveBeat(-1) : seekBars(-1)),
    onArrowRight: () => (editMode ? moveBeat(1) : seekBars(1)),
    onArrowUp: () => editMode && changePitch(1),
    onArrowDown: () => editMode && changePitch(-1),
    onHome: () => apiRef.current && (apiRef.current.tickPosition = 0),
    onToggleMetronome: toggleMetronome,
    onToggleLoop: toggleLoop,
    onToggleEdit: () => onEditModeChange(!editMode),
    onDigit: (d) => editMode && fretDigit(d),
    onDelete: () => editMode && deleteAtCursor(),
    onPlace: () => editMode && placeNoteAtCaret(),
    onDot: () => editMode && cycleDots(),
    onUndo: undo,
    onRedo: redo,
    onEditLyric: () => {
      if (!editMode || !cursorRef.current.beat) return;
      setLyricDraft(cursorRef.current.beat.lyrics?.[0] ?? "");
      setAnnotModal("lyric");
    },
  });

  // Aplica el conjunto de pistas visibles al render.
  function renderTrackSet(next: Set<number>) {
    if (next.size === 0) return;
    setSelectedTracks(next);
    const api = apiRef.current;
    if (!api?.score) return;
    api.renderTracks(api.score.tracks.filter((t) => next.has(t.index)));
  }
  // Eye/visibilidad y alt+click: añade o quita una pista de la vista (multipista).
  function toggleTrack(index: number) {
    const next = new Set(selectedTracks);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    renderTrackSet(next);
  }
  // Clic simple en la fila: mostrar SOLO esa pista.
  function showOnlyTrack(index: number) {
    renderTrackSet(new Set([index]));
  }
  // Mostrar todas las pistas (vista multipista completa).
  function showAllTracks() {
    renderTrackSet(new Set(tracks.map((t) => t.index)));
  }
  // Renombrar una pista (modelo + lista del panel).
  function renameTrack(index: number, name: string) {
    const track = apiRef.current?.score?.tracks[index];
    if (!track) return;
    track.name = name;
    setTracks((ts) => ts.map((t) => (t.index === index ? { ...t, name } : t)));
    setDirty(true);
  }
  // Qué se dibuja en cada staff de la pista (partitura, tablatura, slash, numerada).
  type StaffFlag = "showStandardNotation" | "showTablature" | "showSlash" | "showNumbered";
  function staffFlag(index: number, flag: StaffFlag): boolean {
    const track = apiRef.current?.score?.tracks[index];
    return track ? track.staves.some((s) => s[flag]) : false;
  }
  function setStaffFlag(index: number, flag: StaffFlag, value: boolean) {
    const track = apiRef.current?.score?.tracks[index];
    if (!track) return;
    for (const s of track.staves) s[flag] = value;
    setStaffRev((r) => r + 1);
    setDirty(true);
    apiRef.current?.render();
  }
  const trackIsStringed = (index: number) =>
    apiRef.current?.score?.tracks[index]?.staves.some((s) => s.isStringed) ?? false;
  function staffNumber(index: number, key: "capo" | "displayTranspositionPitch"): number {
    return apiRef.current?.score?.tracks[index]?.staves[0]?.[key] ?? 0;
  }
  function setStaffNumber(index: number, key: "capo" | "displayTranspositionPitch", value: number) {
    const track = apiRef.current?.score?.tracks[index];
    if (!track) return;
    for (const s of track.staves) s[key] = value;
    setStaffRev((r) => r + 1);
    setDirty(true);
    apiRef.current?.render();
  }
  function toggleMute(index: number) {
    const api = apiRef.current;
    const track = api?.score?.tracks[index];
    if (!track) return;
    const next = new Set(mutedTracks);
    const mute = !next.has(index);
    mute ? next.add(index) : next.delete(index);
    setMutedTracks(next);
    api!.changeTrackMute([track], mute);
  }
  function toggleSolo(index: number) {
    const api = apiRef.current;
    const track = api?.score?.tracks[index];
    if (!track) return;
    const solo = soloTrack !== index;
    setSoloTrack(solo ? index : null);
    // limpia solos previos y aplica el nuevo
    if (api?.score) api.changeTrackSolo(api.score.tracks, false);
    if (solo) api!.changeTrackSolo([track], true);
  }
  // Volumen master de la reproducción (0 = silencio, 1 = 100%).
  function changeMasterVolume(v: number) {
    setMasterVol(v);
    masterVolRef.current = v;
    if (apiRef.current) apiRef.current.masterVolume = v;
  }
  // Volumen de una pista (multiplicador relativo a su volumen original; 1 = 100%).
  function changeTrackVolume(index: number, v: number) {
    setTrackVolumes((m) => ({ ...m, [index]: v }));
    const track = apiRef.current?.score?.tracks[index];
    if (track) apiRef.current!.changeTrackVolume([track], v);
  }
  // Pitch global de REPRODUCCIÓN: transpone el sonido de todas las pistas N semitonos
  // sin tocar la notación (método de player, additivo a la transposición del modelo).
  function changePlaybackPitch(delta: number) {
    const next = Math.min(24, Math.max(-24, playbackPitch + delta));
    if (next === playbackPitch) return;
    setPlaybackPitch(next);
    playbackPitchRef.current = next;
    const api = apiRef.current;
    if (api?.score) api.changeTrackTranspositionPitch(api.score.tracks, next);
  }
  // Transposición REAL (modifica la partitura y el sonido): suma N semitonos a la
  // transposición de cada pista indicada. Reversible (se guarda en el modelo).
  function openTranspose() {
    setTransposeTargets(new Set(tracks.map((t) => t.index)));
    setTransposeSemis(0);
    setTransposeOpen(true);
  }
  function transposeTracks(indices: number[], semitones: number) {
    const api = apiRef.current;
    if (!api?.score || semitones === 0 || indices.length === 0) return;
    snapshot();
    for (const i of indices) {
      const track = api.score.tracks[i];
      if (!track) continue;
      for (const s of track.staves) s.transpositionPitch += semitones;
    }
    setStaffRev((r) => r + 1);
    setDirty(true);
    midiDirtyRef.current = true;
    api.render();
  }

  // ── Escalas / tonalidades ──────────────────────────────────────
  // Rango de compases (0-based) señalado en la partitura: de la selección múltiple
  // o de la selección simple. null si no hay nada señalado.
  function selectedBarRange(): { start: number; end: number } | null {
    if (multiBeats.length > 1) {
      const idxs = multiBeats
        .map((b) => (b as any).voice?.bar?.masterBar?.index)
        .filter((n) => typeof n === "number") as number[];
      if (idxs.length) return { start: Math.min(...idxs), end: Math.max(...idxs) };
    }
    if (selection?.bar != null) return { start: selection.bar - 1, end: selection.bar - 1 };
    return null;
  }
  // Ámbito efectivo de la asignación: toda la pieza o los compases señalados.
  function effectiveScope(): { start: number; end: number; whole: boolean } {
    const last = (apiRef.current?.score?.masterBars.length ?? 1) - 1;
    const sel = selectedBarRange();
    if (scopeMode === "selection" && sel) return { ...sel, whole: false };
    return { start: 0, end: Math.max(0, last), whole: true };
  }
  function assignScaleToScope() {
    const { start, end } = effectiveScope();
    setScaleAssignments((prev) => setScaleRange(prev, start, end, scalePicker.tonic, scalePicker.mode));
    setDirty(true);
  }
  function removeScaleZone(bar: number) {
    setScaleAssignments((prev) => prev.filter((a) => !(bar >= a.startBar && bar <= a.endBar)));
    setDirty(true);
  }
  // Calcula y propone la transposición de la zona hacia la escala del selector.
  function startScaleTranspose() {
    const { start, end, whole } = effectiveScope();
    const source = scaleAt(scaleAssignments, start);
    const fromTonic = source ? source.tonic : 0;
    const delta = shortestTranspose(fromTonic, scalePicker.tonic);
    setScaleTranspose({
      start,
      end,
      delta,
      fromLabel: source
        ? scaleDisplay(source.tonic, source.mode, chordNotation, { full: true })
        : `${scaleDisplay(0, "ionian", chordNotation, { full: true })} (por defecto)`,
      toLabel: scaleDisplay(scalePicker.tonic, scalePicker.mode, chordNotation, { full: true }),
      target: { ...scalePicker },
      wholePiece: whole,
    });
  }
  // Aplica la transposición confirmada: reescribe notas, ajusta la armadura de la zona
  // y reasigna la escala a la objetivo.
  function applyScaleTranspose() {
    const t = scaleTranspose;
    const api = apiRef.current;
    if (!t || !api?.score) {
      setScaleTranspose(null);
      return;
    }
    snapshot();
    const keySig = keySignatureFor(t.target.tonic, t.target.mode);
    for (const track of api.score.tracks) {
      for (const staff of track.staves) {
        // Guarda la armadura del compás siguiente a la zona para conservar el borde.
        const afterBar = staff.bars[t.end + 1];
        const afterKey = afterBar ? afterBar.keySignature : null;
        for (let i = t.start; i <= t.end; i++) {
          const bar = staff.bars[i];
          if (!bar) continue;
          if (t.delta !== 0) {
            for (const voice of bar.voices)
              for (const beat of voice.beats) beat.notes?.forEach((n) => shiftNote(n, t.delta));
          }
          bar.keySignature = keySig as unknown as alphaTab.model.KeySignature;
        }
        // Si tras la zona no había un cambio explícito, restablece para no propagar.
        if (afterBar && afterKey != null) afterBar.keySignature = afterKey;
      }
    }
    setScaleAssignments((prev) => setScaleRange(prev, t.start, t.end, t.target.tonic, t.target.mode));
    setScaleTranspose(null);
    setStaffRev((r) => r + 1);
    refresh(undefined, { full: true });
  }
  // Des-colapsa SOLO la barra (lateral o inferior) que contiene una sección cuando un
  // evento dispara su visibilidad (p. ej. activar "Escalas"). No toca el resto.
  function revealRegion(region: Region) {
    if (region === "left") setLeftCollapsed(false);
    else if (region === "right") setRightCollapsed(false);
    else if (region === "bottom") setBottomCollapsed(false);
  }
  // Recalcula las cajas de color de las zonas de escala (overlay sobre la partitura).
  function updateScaleOverlay() {
    const api = apiRef.current;
    const bl = (api as any)?.renderer?.boundsLookup;
    const staff = api?.tracks?.[0]?.staves?.[0];
    if (!scalesMode || !api || !bl || !staff || view.mode === "lyrics") {
      setScaleBoxes((b) => (b.length ? [] : b));
      return;
    }
    const boxes: { x: number; y: number; w: number; h: number; color: string; label?: string }[] = [];
    for (const a of scaleAssignments) {
      const color = scaleColor(a.tonic, a.mode);
      const label = scaleDisplay(a.tonic, a.mode, chordNotation, { full: true });
      for (let i = a.startBar; i <= a.endBar; i++) {
        const fb = staff.bars[i]?.voices?.[0]?.beats?.[0];
        if (!fb) continue;
        const bb = bl.findBeat(fb);
        if (!bb) continue; // no renderizado (lazy)
        const vb = bb.barBounds.visualBounds;
        boxes.push({ x: vb.x, y: vb.y, w: vb.w, h: vb.h, color, label: i === a.startBar ? label : undefined });
      }
    }
    setScaleBoxes(boxes);
  }

  // Asigna un instrumento (programa General MIDI) a una pista. Se guarda en el
  // score (playbackInfo.program) → afecta a la previsualización y a los exports
  // (MIDI/MP3). El audio se regenera de forma diferida (al pulsar play).
  function setTrackInstrument(index: number, program: number) {
    const track = apiRef.current?.score?.tracks[index];
    if (!track) return;
    track.playbackInfo.program = program;
    // El program-change del MIDI sale de una AUTOMACIÓN de instrumento en el primer
    // beat (la crea finish() desde playbackInfo.program la primera vez). Si ya existe,
    // cambiar playbackInfo no basta: hay que actualizar esa automación.
    const M = alphaTab.model;
    for (const staff of track.staves) {
      const firstBeat = staff.bars?.[0]?.voices?.[0]?.beats?.[0];
      if (!firstBeat) continue;
      const autom = firstBeat.getAutomation(M.AutomationType.Instrument);
      if (autom) autom.value = program;
      else firstBeat.automations.push(M.Automation.buildInstrumentAutomation(false, 0, program));
    }
    setTrackPrograms((p) => ({ ...p, [index]: program }));
    midiDirtyRef.current = true;
    setDirty(true);
  }
  // Elige el instrumento de render de una pista desde el selector (valor codificado:
  // "P:<programa>" = SF2/General MIDI, "I:<id>" = instrumento SFZ del catálogo).
  function chooseInstrument(index: number, value: string) {
    if (value.startsWith("P:")) {
      const program = Number(value.slice(2));
      setTrackInstrument(index, program); // actualiza el score (preview + export SF2)
      setTrackInstruments((m) => ({ ...m, [index]: { engine: "sf2", program } }));
    } else if (value.startsWith("I:")) {
      setTrackInstruments((m) => ({ ...m, [index]: { engine: "sfz", id: value.slice(2) } }));
    }
  }

  // ── Configuración del proyecto (modal) ─────────────────────────
  function openSettings() {
    setMetaTitle(projectTitle ?? "");
    setMetaDesc(projectDescription ?? "");
    setImportMsg(null);
    setSettingsOpen(true);
  }
  async function saveMeta() {
    if (!onUpdateMeta) return;
    setMetaSaving(true);
    try {
      await onUpdateMeta({ title: metaTitle.trim(), description: metaDesc });
      setScoreTitle(metaTitle.trim() || scoreTitle);
    } finally {
      setMetaSaving(false);
    }
  }
  // Combina las pistas de un fichero importado con las del Score actual: se añaden
  // a continuación (no reemplazan). Igualamos el nº de compases (rellenando con
  // compases vacíos) y reasignamos ids para no colisionar con los existentes; al
  // final recargamos por round-trip JSON para dejar el modelo consistente.
  async function importTracksFromFile(file: File) {
    const api = apiRef.current;
    if (!api) return;
    // Fichero Musix (.mu6 / .musix.json) o JSON de partitura: ABRE el proyecto
    // (reemplaza), restaurando partitura + preferencias embebidas. No es "añadir pistas".
    if (/\.(mu6|musix|json)$/i.test(file.name)) {
      setImporting(true);
      setImportMsg(null);
      try {
        const text = new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()));
        const parsed = JSON.parse(text);
        const isWrapper = parsed && parsed.format === "musix" && parsed.score;
        const scoreJson = isWrapper ? JSON.stringify(parsed.score) : text;
        if (api.score) snapshot();
        freshLoadRef.current = false;
        pendingPrefsRef.current = isWrapper && parsed.prefs ? parsed.prefs : null;
        api.renderScore(alphaTab.model.JsonConverter.jsonToScore(scoreJson));
        midiDirtyRef.current = true;
        setDirty(true);
        setImportMsg({ ok: true, text: isWrapper ? "Proyecto Musix cargado. Recuerda guardar." : "Partitura JSON cargada." });
      } catch (err) {
        console.error("[import] JSON/Musix", err);
        setImportMsg({ ok: false, text: "JSON no válido o ilegible." });
      } finally {
        setImporting(false);
      }
      return;
    }
    // Proyecto vacío (sin score todavía): cargamos el fichero como partitura inicial.
    if (!api.score || api.score.tracks.length === 0) {
      setImporting(true);
      setImportMsg(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        snapshot();
        freshLoadRef.current = false;
        api.load(bytes);
        midiDirtyRef.current = true;
        setDirty(true);
        setImportMsg({ ok: true, text: "Fichero cargado. Recuerda guardar." });
      } catch (err) {
        console.error("[import] load inicial", err);
        setImportMsg({ ok: false, text: "No se pudo leer el fichero." });
      } finally {
        setImporting(false);
      }
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const M = alphaTab.model;
      let imported: alphaTab.model.Score;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        imported = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, api.settings);
      } catch (err) {
        console.error("[import] loadScoreFromBytes", err);
        setImportMsg({ ok: false, text: "No se pudo leer el fichero." });
        return;
      }
      if (!imported.tracks.length) {
        setImportMsg({ ok: false, text: "El fichero no contiene pistas." });
        return;
      }
      const score = api.score;
      snapshot();
      // 1. Igualar nº de compases (si el importado tiene más, ampliamos el actual).
      while (score.masterBars.length < imported.masterBars.length) appendBar();
      const barCount = score.masterBars.length;
      // 2. Reasignar ids e incorporar cada pista, rellenando barras a barCount.
      let beatId = maxBeatId() + 1;
      let noteId = maxNoteId() + 1;
      const names: string[] = [];
      for (const t of imported.tracks) {
        for (const st of t.staves) {
          for (const b of st.bars)
            for (const v of b.voices)
              for (const bt of v.beats) {
                bt.id = beatId++;
                for (const n of bt.notes) n.id = noteId++;
              }
          while (st.bars.length < barCount) {
            const prev = st.bars[st.bars.length - 1];
            const bar = new M.Bar();
            if (prev) {
              bar.clef = prev.clef;
              bar.keySignature = prev.keySignature;
            }
            const voice = new M.Voice();
            const beat = new M.Beat();
            beat.id = beatId++;
            beat.duration = M.Duration.Whole;
            voice.addBeat(beat);
            bar.addVoice(voice);
            st.addBar(bar);
          }
          if (st.bars.length > barCount) st.bars.length = barCount;
        }
        score.addTrack(t);
        names.push(t.name || `Pista ${score.tracks.length}`);
      }
      // 3. Recarga limpia (round-trip) → refresca lista de pistas vía scoreLoaded.
      freshLoadRef.current = false;
      score.finish(api.settings);
      const json = alphaTab.model.JsonConverter.scoreToJson(score);
      api.renderScore(alphaTab.model.JsonConverter.jsonToScore(json));
      midiDirtyRef.current = true;
      setDirty(true);
      setImportMsg({
        ok: true,
        text: `Añadida${names.length > 1 ? "s" : ""}: ${names.join(", ")}`,
      });
    } catch (err) {
      console.error("[import] merge", err);
      setImportMsg({ ok: false, text: "No se pudieron combinar las pistas." });
    } finally {
      setImporting(false);
    }
  }

  // Arrastrar-y-soltar un fichero sobre el lienzo o el área de importación.
  function onFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !importing) importTracksFromFile(f);
  }

  // ── Persistencia / export ──────────────────────────────────────
  async function handleSave() {
    const api = apiRef.current;
    if (!api?.score || !onSave) return;
    setSaving(true);
    try {
      await onSave(JSON.parse(alphaTab.model.JsonConverter.scoreToJson(api.score)));
      const dt = new Date();
      setSavedAt(`${dt.getHours()}:${String(dt.getMinutes()).padStart(2, "0")}`);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }
  function download(name: string, data: BlobPart, type = "application/octet-stream") {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportGp() {
    const api = apiRef.current;
    if (!api?.score) return;
    const bytes = new alphaTab.exporter.Gp7Exporter().export(api.score, api.settings);
    download(`${title}.gp`, bytes as unknown as BlobPart);
  }
  function exportMscz() {
    const api = apiRef.current;
    if (!api?.score) return;
    const bytes = new alphaTab.exporter.MuseScoreExporter().export(api.score, api.settings);
    download(`${title}.mscz`, bytes as unknown as BlobPart);
  }
  // Formato Musix AUTOCONTENIDO: la partitura completa (modelo AlphaTab, superset
  // de lo que cabe en un .gp) + las preferencias propias de la app (colores,
  // instrumentos SFZ/SF2, descripciones, notación de acordes, pitch). Reabrir este
  // fichero restaura el proyecto entero, no solo la partitura.
  function exportJson() {
    const api = apiRef.current;
    if (!api?.score) return;
    const musix = {
      format: "musix",
      version: 1,
      app: "Musix",
      savedAt: new Date().toISOString(),
      prefs: {
        trackColors,
        chordNotation,
        instruments: trackInstruments,
        descriptions: trackDescriptions,
        playbackPitch,
        scales: scaleAssignments,
      },
      score: JSON.parse(alphaTab.model.JsonConverter.scoreToJson(api.score)),
    };
    download(`${title}.mu6`, JSON.stringify(musix), "application/json");
  }

  // Botón de icono cuadrado, coherente en toda la barra.
  const iconBtn =
    "flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-ink-600 disabled:opacity-40 disabled:hover:bg-transparent";
  const wrapperStyle = view.frame === "folio" ? { width: pageDims(view.orientation).width } : undefined;

  // ── Bloques de panel (ubicables por región) ────────────────────
  // Bloque "Herramientas": Edición (figura/compases) + propiedades del beat/compás.
  const toolsBlockContent = editMode ? (
    <>
      <div className="px-3 py-3">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-soft">Edición</h4>
        {multiBeats.length > 1 ? (
          <p className="mb-2 flex items-center justify-between gap-2 rounded bg-accent/15 px-2 py-1 text-xs text-accent-soft ring-1 ring-accent/40">
            <span>
              <b>{multiBeats.length}</b> posiciones seleccionadas
            </span>
            <button className="text-slate-400 hover:text-accent" onClick={() => setMultiBeats([])}>
              limpiar
            </button>
          </p>
        ) : selection ? (
          <p className="mb-2 text-xs text-slate-300">
            Compás <b>{selection.bar ?? "—"}</b> · {selection.label}
          </p>
        ) : (
          <p className="mb-2 text-xs text-slate-500">
            Clic en una nota o compás. Arrastra para seleccionar varias.
          </p>
        )}
        <div className="mb-2">
          <ToolLabel>Figura a colocar</ToolLabel>
          <div className="flex flex-wrap gap-1">
            {DURATIONS.map((d) => (
              <ToolButton
                key={d.label}
                title={d.title}
                desc={`Figura de 1/${d.label}`}
                active={d.value === placeDuration}
                onClick={() => chooseDuration(d.value)}
              >
                <MusicGlyph name={d.glyph} size={22} />
              </ToolButton>
            ))}
            <ToolButton
              title="Puntillo"
              desc="Alarga la figura la mitad de su valor (tecla .)"
              active={!!placeDots}
              onClick={togglePlaceDot}
            >
              <MusicGlyph name="dotted" size={22} />
            </ToolButton>
          </div>
        </div>
        <div className="mb-2">
          <ToolLabel>Compases</ToolLabel>
          <div className="flex flex-wrap gap-1">
            <ToolButton
              title="Insertar compás antes"
              desc="Nuevo compás vacío justo antes del actual"
              disabled={!selection?.hasBeat}
              onClick={() => insertBarRelative("before")}
            >
              <Icon name="barInsertBefore" size={18} />
            </ToolButton>
            <ToolButton
              title="Insertar compás después"
              desc="Nuevo compás vacío justo después del actual"
              disabled={!selection?.hasBeat}
              onClick={() => insertBarRelative("after")}
            >
              <Icon name="barInsertAfter" size={18} />
            </ToolButton>
            <ToolButton
              title="Añadir compás al final"
              desc="Crea un compás vacío al final (también con → en el último pulso)"
              onClick={appendBarAndSelect}
            >
              <Icon name="barAppend" size={18} />
            </ToolButton>
            <ToolButton
              title="Eliminar el compás actual"
              desc="Borra el compás en todas las pistas"
              disabled={!selection?.hasBeat}
              onClick={deleteCurrentBar}
            >
              <Icon name="trash" size={17} />
            </ToolButton>
          </div>
          {selection?.hasBeat && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Tooltip label="Clave" desc="Cambia la clave desde este compás. «Heredar» quita el cambio.">
                <span className="inline-flex items-center gap-1 rounded bg-ink-700 pl-1.5">
                  <Icon name="clef" size={14} className="text-slate-400" />
                  <select
                    aria-label="Clave"
                    className="rounded bg-ink-700 py-1 pr-1 text-xs text-slate-200"
                    value={selection.clef}
                    onChange={(e) => (e.target.value === "inherit" ? inheritClef() : setClef(Number(e.target.value)))}
                  >
                    {CLEFS.map((c) => (
                      <option key={c.label} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                    {selection.bar !== 1 && <option value="inherit">↺ heredar</option>}
                  </select>
                </span>
              </Tooltip>
              <Tooltip label="Armadura" desc="Tonalidad (sostenidos/bemoles) desde este compás. «Heredar» quita el cambio.">
                <span className="inline-flex items-center gap-1 rounded bg-ink-700 pl-1.5">
                  <Icon name="keySignature" size={14} className="text-slate-400" />
                  <select
                    aria-label="Armadura"
                    className="rounded bg-ink-700 py-1 pr-1 text-xs text-slate-200"
                    value={selection.keySig}
                    onChange={(e) =>
                      e.target.value === "inherit" ? inheritKeySignature() : setKeySignature(Number(e.target.value))
                    }
                  >
                    {KEYS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                    {selection.bar !== 1 && <option value="inherit">↺ heredar</option>}
                  </select>
                </span>
              </Tooltip>
              <Tooltip label="Compás (métrica)" desc="Numerador/denominador desde este compás.">
                <span className="inline-flex items-center gap-1 rounded bg-ink-700 px-1.5 py-0.5">
                  <Icon name="meter" size={14} className="text-slate-400" />
                  <input
                    type="number"
                    min={1}
                    max={32}
                    aria-label="Numerador del compás"
                    value={selection.timeNum}
                    onChange={(e) => setTimeSignature(Number(e.target.value), selection.timeDen)}
                    className="w-9 rounded bg-ink-800 px-1 py-0.5 text-center text-xs text-slate-200"
                  />
                  <span className="text-slate-500">/</span>
                  <select
                    aria-label="Denominador del compás"
                    className="rounded bg-ink-800 px-1 py-0.5 text-xs text-slate-200"
                    value={selection.timeDen}
                    onChange={(e) => setTimeSignature(selection.timeNum, Number(e.target.value))}
                  >
                    {[1, 2, 4, 8, 16, 32].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </span>
              </Tooltip>
              {selection.bar !== 1 && (
                <ToolButton
                  title="Heredar métrica anterior"
                  desc="Quita el cambio de compás (vuelve a la métrica previa)"
                  onClick={inheritTimeSignature}
                >
                  <Icon name="undo" size={15} />
                </ToolButton>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Tooltip wide label="Clic en línea/espacio fija la altura · ↑↓ tono · Enter coloca · Supr quita nota → silencio → quita posición · . puntillo · → añade posición si el compás no está completo, si no pasa/crea compás">
            <span className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-ink-600 text-[10px] text-slate-500">
              ?
            </span>
          </Tooltip>
        </div>
      </div>

      {selection?.hasBeat && (
        <div className="border-t border-ink-700 px-3 py-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-soft">Herramientas</h4>

          <div className="mb-2">
            <ToolLabel>Dinámica</ToolLabel>
            <div className="flex flex-wrap gap-1">
              {DYNAMICS.map((d) => (
                <ToolButton
                  key={d.label}
                  title={d.label}
                  desc={d.desc}
                  active={selection.dynamics === d.value}
                  onClick={() => applyDynamicsAll(d.value)}
                >
                  <span className="text-xs font-semibold italic">{d.label}</span>
                </ToolButton>
              ))}
              <ToolButton
                title="Crescendo"
                desc="Aumenta la intensidad progresivamente"
                active={selection.crescendo === 1}
                onClick={() => setCrescendo(1)}
              >
                <MusicGlyph name="crescendo" size={16} />
              </ToolButton>
              <ToolButton
                title="Diminuendo"
                desc="Reduce la intensidad progresivamente"
                active={selection.crescendo === 2}
                onClick={() => setCrescendo(2)}
              >
                <MusicGlyph name="diminuendo" size={16} />
              </ToolButton>
            </div>
          </div>

          <div className="mb-2">
            <ToolLabel>Articulación</ToolLabel>
            <div className="flex flex-wrap items-center gap-1">
              <ToolButton
                title="Tresillo"
                desc={multiBeats.length > 1 ? "Aplica tresillo a la selección" : "Tres figuras en el espacio de dos"}
                active={selection.triplet && multiBeats.length <= 1}
                onClick={() => (multiBeats.length > 1 ? applyTripletAll() : toggleTriplet())}
              >
                <MusicGlyph name="triplet" size={16} />
              </ToolButton>
              <ToolButton
                title="Ligadura"
                desc={multiBeats.length > 1 ? "Liga las notas de la selección" : "Liga con la nota siguiente"}
                active={selection.tie && multiBeats.length <= 1}
                onClick={() => (multiBeats.length > 1 ? applyTieAll() : toggleTie())}
              >
                <MusicGlyph name="tie" size={16} />
              </ToolButton>
              <ToolButton
                title="Puntillo"
                desc="Alarga la figura señalada la mitad de su valor (tecla .)"
                active={selection.dots > 0}
                onClick={cycleDots}
              >
                <MusicGlyph name="dotted" size={16} />
                {selection.dots > 1 && <span className="ml-0.5 text-[10px]">×{selection.dots}</span>}
              </ToolButton>
              <PlusMinus
                title="Semitono"
                descMinus="Baja la selección un semitono"
                descPlus="Sube la selección un semitono"
                onMinus={() => transposeSelection(-1)}
                onPlus={() => transposeSelection(1)}
                center={<Icon name="music" size={12} />}
              />
            </div>
          </div>

          <div className="mb-2">
            <ToolLabel>Estructura</ToolLabel>
            <div className="flex flex-wrap items-center gap-1">
              <ToolButton
                title="Inicio de repetición"
                desc="Marca el comienzo de un fragmento que se repite"
                active={selection.repeatStart}
                onClick={toggleRepeatStart}
              >
                <MusicGlyph name="repeatStart" size={16} />
              </ToolButton>
              <ToolButton
                title="Fin de repetición"
                desc="Marca el final de la repetición"
                active={selection.repeatEnd}
                onClick={toggleRepeatEnd}
              >
                <MusicGlyph name="repeatEnd" size={16} />
              </ToolButton>
              <ToolButton
                title="Primera vuelta"
                desc="Casilla de 1ª vez sobre el compás"
                active={!!(selection.endings & 1)}
                onClick={() => toggleEnding(0)}
              >
                <span className="text-xs font-semibold">1.</span>
              </ToolButton>
              <ToolButton
                title="Segunda vuelta"
                desc="Casilla de 2ª vez sobre el compás"
                active={!!(selection.endings & 2)}
                onClick={() => toggleEnding(1)}
              >
                <span className="text-xs font-semibold">2.</span>
              </ToolButton>
              <Tooltip label="Marca de salto" desc="Segno, Coda, Fine, Da Capo, D.S…">
                <select
                  aria-label="Marca de salto/repetición"
                  className="h-8 rounded bg-ink-700 px-1.5 text-xs text-slate-200"
                  value={selection.direction ?? ""}
                  onChange={(e) => setDirection(e.target.value === "" ? null : Number(e.target.value))}
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d.label} value={d.value ?? ""}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Tooltip>
            </div>
          </div>

          <div>
            <ToolLabel>Anotaciones</ToolLabel>
            <div className="flex flex-wrap gap-1">
              <ToolButton
                title="Texto"
                desc="Frase o indicación sobre la posición"
                active={!!selection.text}
                onClick={() => {
                  setTextDraft(selection.text);
                  setAnnotModal("text");
                }}
              >
                <Icon name="text" size={16} />
              </ToolButton>
              <ToolButton
                title="Letra"
                desc="Sílaba o palabra del pulso (tecla T)"
                active={!!selection.lyric}
                onClick={() => {
                  setLyricDraft(selection.lyric);
                  setAnnotModal("lyric");
                }}
              >
                <Icon name="lyrics" size={16} />
              </ToolButton>
              <ToolButton
                title={selection.chordId ? `Acorde: ${chordDisplay(selection.chordId, chordNotation)}` : "Acorde"}
                desc="Acorde mostrado sobre la posición"
                active={!!selection.chordId}
                onClick={() => {
                  const s = parseChordId(selection.chordId);
                  setChordDraft(s?.kind === "known" ? { root: s.root, quality: s.quality } : { root: null, quality: "maj" });
                  setCustomDraft(s?.kind === "custom" ? s.text : "");
                  setAnnotModal("chord");
                }}
              >
                <Icon name="chord" size={16} />
              </ToolButton>
              <ToolButton
                title="Sección"
                desc="Título de parte (Estrofa, Estribillo, Puente…)"
                active={!!selection.section}
                onClick={() => {
                  setSectionDraft(selection.section);
                  setAnnotModal("section");
                }}
              >
                <Icon name="section" size={16} />
              </ToolButton>
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;

  // Bloque "Pistas": vista en lista (controles) o cronograma (cuadrados por compás).
  const score = apiRef.current?.score;
  const barCount = score?.masterBars.length ?? 0;
  const barIdx = Array.from({ length: barCount }, (_, i) => i);
  const setTracksView = (v: "list" | "timeline") => setLayout({ ...layout, tracksView: v });
  const tracksBlockContent = (
    <div className="px-3 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pistas</h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">{selectedTracks.size}/{tracks.length} visibles</span>
          <Tooltip label="Mostrar todas (multipista)">
            <button
              aria-label="Vista multipista (todas)"
              className="rounded bg-ink-700/60 px-1.5 py-1 text-[10px] text-slate-300 hover:bg-ink-600 disabled:opacity-40"
              onClick={showAllTracks}
              disabled={selectedTracks.size === tracks.length}
            >
              Todas
            </button>
          </Tooltip>
          <div className="flex items-center rounded bg-ink-700/60">
            <Tooltip label="Vista de lista">
              <button
                aria-label="Vista de lista"
                className={`flex h-6 w-6 items-center justify-center rounded ${
                  layout.tracksView === "list" ? "bg-accent text-ink-900" : "text-slate-400 hover:bg-ink-600"
                }`}
                onClick={() => setTracksView("list")}
              >
                <Icon name="list" size={14} />
              </button>
            </Tooltip>
            <Tooltip label="Cronograma de compases">
              <button
                aria-label="Cronograma de compases"
                className={`flex h-6 w-6 items-center justify-center rounded ${
                  layout.tracksView === "timeline" ? "bg-accent text-ink-900" : "text-slate-400 hover:bg-ink-600"
                }`}
                onClick={() => setTracksView("timeline")}
              >
                <Icon name="grid" size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {layout.tracksView === "list" ? (
        <>
        <p className="mb-1.5 text-[10px] leading-snug text-slate-600">
          Clic: ver solo esa · Alt+clic: añadir/quitar · Doble clic: ajustes
        </p>
        <ul className="space-y-0.5">
          {tracks.map((t) => {
            const visible = selectedTracks.has(t.index);
            const muted = mutedTracks.has(t.index);
            return (
              <li
                key={t.index}
                className={`rounded px-1.5 py-1 ${
                  visible ? "bg-accent/10 ring-1 ring-accent/30" : "hover:bg-ink-700"
                }`}
              >
                <div className="flex items-center gap-1">
                  <div
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 select-none"
                    onClick={(e) => (e.altKey ? toggleTrack(t.index) : showOnlyTrack(t.index))}
                    onDoubleClick={() => setTrackModal(t.index)}
                    title="Clic: ver solo esta · Alt+clic: añadir/quitar · Doble clic: configurar"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/20"
                      style={{ background: colorOf(t.index) }}
                    />
                    <span className={`min-w-0 flex-1 truncate text-sm ${visible ? "text-slate-100" : "text-slate-500"}`}>{t.name}</span>
                  </div>
                  <Tooltip label="Configurar pista">
                    <button
                      aria-label={`Configurar ${t.name}`}
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-ink-600 hover:text-accent"
                      onClick={() => setTrackModal(t.index)}
                    >
                      <Icon name="settings" size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip label={visible ? "Quitar de la vista" : "Añadir a la vista"}>
                    <button
                      className={`flex h-6 w-6 items-center justify-center rounded ${
                        visible ? "text-accent hover:bg-ink-600" : "text-slate-600 hover:bg-ink-600"
                      }`}
                      onClick={() => toggleTrack(t.index)}
                    >
                      <Icon name={visible ? "eye" : "eyeOff"} size={15} />
                    </button>
                  </Tooltip>
                  <Tooltip label={soloTrack === t.index ? "Quitar solo" : "Solo"}>
                    <button
                      className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold ${
                        soloTrack === t.index ? "bg-accent text-ink-900" : "text-slate-500 hover:bg-ink-600"
                      }`}
                      onClick={() => toggleSolo(t.index)}
                    >
                      S
                    </button>
                  </Tooltip>
                  <Tooltip label={muted ? "Activar sonido" : "Silenciar"}>
                    <button
                      className={`flex h-6 w-6 items-center justify-center rounded ${
                        muted ? "text-red-400 hover:bg-ink-600" : "text-slate-400 hover:bg-ink-600"
                      }`}
                      onClick={() => toggleMute(t.index)}
                    >
                      <Icon name={muted ? "volumeOff" : "volume"} size={15} />
                    </button>
                  </Tooltip>
                </div>
                <div className="mt-1 flex items-center gap-1.5 pl-0.5">
                  <Icon name="volume" size={12} className="shrink-0 text-slate-500" />
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={trackVolumes[t.index] ?? 1}
                    onChange={(e) => changeTrackVolume(t.index, Number(e.target.value))}
                    title="Volumen de la pista"
                    aria-label={`Volumen de ${t.name}`}
                    className="h-1 flex-1 accent-accent"
                  />
                  <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
                    {Math.round((trackVolumes[t.index] ?? 1) * 100)}%
                  </span>
                </div>
                <select
                  className="mt-1 w-full rounded bg-ink-700 px-1.5 py-1 text-[11px] text-slate-300"
                  value={
                    trackInstruments[t.index]?.engine === "sfz"
                      ? `I:${(trackInstruments[t.index] as { id: string }).id}`
                      : `P:${trackPrograms[t.index] ?? 0}`
                  }
                  onChange={(e) => chooseInstrument(t.index, e.target.value)}
                  title="Instrumento"
                >
                  {sfzCatalog.length > 0 &&
                    Array.from(new Set(sfzCatalog.map((s) => s.family))).map((fam) => (
                      <optgroup key={`sfz-${fam}`} label={`◆ ${fam}`}>
                        {sfzCatalog.filter((s) => s.family === fam).map((s) => (
                          <option key={s.id} value={`I:${s.id}`}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  {GM_FAMILY_ORDER.map((fam) => (
                    <optgroup key={fam} label={fam}>
                      {GM_INSTRUMENTS.filter((g) => g.family === fam).map((g) => (
                        <option key={g.program} value={`P:${g.program}`}>
                          {g.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
        </>
      ) : (
        // Cronograma: una fila por pista, un cuadrado por compás (coloreado si la
        // pista suena en ese compás). Número de compás cada 4. Scroll horizontal.
        <div className="overflow-x-auto pb-1">
          <div className="inline-block min-w-full">
            {/* cabecera de números de compás */}
            <div className="flex">
              <div className="w-24 shrink-0" />
              {barIdx.map((i) => (
                <div key={i} className="w-3.5 shrink-0 pr-px text-center text-[7px] leading-none text-slate-500">
                  {(i + 1) % 4 === 0 ? i + 1 : ""}
                </div>
              ))}
            </div>
            {tracks.map((t) => {
              const track = score?.tracks[t.index];
              return (
                <div key={t.index} className="mb-px flex items-center">
                  <div className="flex w-24 shrink-0 items-center gap-1 pr-1">
                    <input
                      type="color"
                      value={colorOf(t.index)}
                      onChange={(e) => setTrackColor(t.index, e.target.value)}
                      title="Color de la pista"
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                    />
                    <span
                      className={`min-w-0 flex-1 cursor-pointer truncate text-[10px] select-none ${
                        selectedTracks.has(t.index) ? "text-slate-100" : "text-slate-500"
                      }`}
                      onClick={(e) => (e.altKey ? toggleTrack(t.index) : showOnlyTrack(t.index))}
                      onDoubleClick={() => setTrackModal(t.index)}
                      title="Clic: ver solo esta · Alt+clic: añadir/quitar · Doble clic: configurar"
                    >
                      {t.name}
                    </span>
                  </div>
                  {barIdx.map((i) => {
                    const has = track ? barHasContent(track, i) : false;
                    return (
                      <button
                        key={i}
                        title={`Compás ${i + 1}`}
                        onClick={() => apiRef.current && (apiRef.current.tickPosition = barBoundsRef.current[i] ?? 0)}
                        className="h-3.5 w-3.5 shrink-0 pr-px"
                      >
                        <span
                          className="block h-full w-full rounded-[2px]"
                          style={{ background: has ? colorOf(t.index) : "#3f3f46" }}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const scalesBlockContent = scalesMode ? (
    <ScalesPanel
      notation={chordNotation}
      assignments={scaleAssignments}
      selection={selectedBarRange()}
      scopeMode={scopeMode}
      onScopeModeChange={setScopeMode}
      picker={scalePicker}
      onPickerChange={setScalePicker}
      onAssign={assignScaleToScope}
      onRemove={removeScaleZone}
      onOpenCircle={() => setCircleOpen(true)}
      onTranspose={startScaleTranspose}
      onEditRow={(a) => {
        setScalePicker({ tonic: a.tonic, mode: a.mode });
        setScopeMode("selection");
      }}
      editMode={editMode}
    />
  ) : null;
  const blockContent: Record<BlockId, ReactNode> = {
    tools: toolsBlockContent,
    tracks: tracksBlockContent,
    scales: scalesBlockContent,
  };
  // Bloques (con contenido) asignados a una región, en orden estable.
  function regionChildren(region: Region) {
    return BLOCK_ORDER.filter((b) => layout.placement[b] === region && blockContent[b]).map((b) => (
      <div key={b} className={region === "bottom" ? "min-w-0 flex-1 overflow-auto" : "w-full"}>
        {blockContent[b]}
      </div>
    ));
  }
  const leftChildren = regionChildren("left");
  const rightChildren = regionChildren("right");
  const bottomChildren = regionChildren("bottom");

  return (
    <div className="flex h-full flex-col">
      {/* Barra de herramientas superior */}
      <div className="flex flex-wrap items-center gap-1 border-b border-ink-600 bg-ink-800 px-3 py-2">
        <Tooltip label={playing ? "Pausa (Espacio)" : "Reproducir (Espacio)"}>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-ink-900 transition-colors hover:brightness-110 disabled:opacity-40"
            disabled={!ready}
            onClick={playPause}
          >
            <Icon name={playing ? "pause" : "play"} size={18} />
          </button>
        </Tooltip>
        <Tooltip label="Detener">
          <button className={iconBtn} disabled={!ready} onClick={() => apiRef.current?.stop()}>
            <Icon name="stop" size={16} />
          </button>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-ink-600" />
        <SpeedSlider value={speed} onChange={changeSpeed} disabled={!ready} />

        <div className="mx-1 h-5 w-px bg-ink-600" />
        <MetronomeSettings enabled={metroOn} onToggle={toggleMetronome} config={metroCfg} onChange={setMetroCfg} disabled={!ready} />
        <Tooltip label="Repetir selección (L)">
          <button
            className={`${iconBtn} ${looping ? "bg-accent text-ink-900 hover:bg-accent" : ""}`}
            onClick={toggleLoop}
            disabled={!ready}
          >
            <Icon name="loop" size={16} />
          </button>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-ink-600" />
        <div className="flex items-center gap-1.5">
          <Tooltip label={masterVol === 0 ? "Activar sonido" : "Silenciar"}>
            <button
              className={iconBtn}
              onClick={() => changeMasterVolume(masterVol === 0 ? 1 : 0)}
              disabled={!ready}
              aria-label="Volumen general"
            >
              <Icon name={masterVol === 0 ? "volumeOff" : "volume"} size={16} />
            </button>
          </Tooltip>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={masterVol}
            onChange={(e) => changeMasterVolume(Number(e.target.value))}
            disabled={!ready}
            title="Volumen general"
            aria-label="Volumen general"
            className="h-1 w-20 accent-accent disabled:opacity-40"
          />
          <span className="w-9 text-right text-xs tabular-nums text-slate-400">{Math.round(masterVol * 100)}%</span>
        </div>

        <div className="mx-1 h-5 w-px bg-ink-600" />
        {/* Pitch global de reproducción (no toca la partitura) */}
        <div
          className="flex items-center gap-0.5"
          title="Pitch de reproducción: traspone el SONIDO N semitonos sin tocar la partitura"
        >
          <button className={iconBtn} onClick={() => changePlaybackPitch(-1)} disabled={!hasScore} aria-label="Bajar pitch de reproducción">
            <Icon name="minus" size={14} />
          </button>
          <span className={`min-w-[4.2rem] text-center text-xs tabular-nums ${playbackPitch !== 0 ? "text-accent" : "text-slate-400"}`}>
            Pitch {playbackPitch > 0 ? `+${playbackPitch}` : playbackPitch}
          </span>
          <button className={iconBtn} onClick={() => changePlaybackPitch(1)} disabled={!hasScore} aria-label="Subir pitch de reproducción">
            <Icon name="plus" size={14} />
          </button>
        </div>
        <Tooltip label="Transponer pistas (modifica la partitura)">
          <button className={iconBtn} onClick={openTranspose} disabled={!hasScore} aria-label="Transponer pistas">
            <Icon name="music" size={16} />
          </button>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-ink-600" />
        <Tooltip label="Deshacer (Ctrl+Z)">
          <button className={iconBtn} onClick={undo} disabled={undoCount === 0}>
            <Icon name="undo" size={16} />
          </button>
        </Tooltip>
        <Tooltip label="Rehacer (Ctrl+Shift+Z)">
          <button className={iconBtn} onClick={redo} disabled={redoCount === 0}>
            <Icon name="redo" size={16} />
          </button>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-ink-600" />
        <Tooltip label="Escalas" desc="Asigna tonalidades a la pieza o a zonas, colorea las zonas y permite transponer.">
          <button
            className={`${iconBtn} ${scalesMode ? "bg-accent text-ink-900 hover:bg-accent" : ""}`}
            onClick={() => {
              const next = !scalesMode;
              setScalesMode(next);
              if (next) {
                // Asegura que el panel sea visible: región lateral válida + des-colapsada.
                let region = layout.placement.scales;
                if (region !== "left" && region !== "right" && region !== "bottom") {
                  region = "right";
                  setLayout({ ...layout, placement: { ...layout.placement, scales: "right" } });
                }
                revealRegion(region);
              }
            }}
            disabled={!hasScore}
            aria-label="Escalas"
          >
            <Icon name="scale" size={17} />
          </button>
        </Tooltip>
        <ViewSettings view={view} onChange={setView} layout={layout} onLayoutChange={setLayout} disabled={!hasScore} />
        <div className="flex items-center rounded-md bg-ink-700/60">
          <Tooltip label="Alejar">
            <button className={iconBtn} onClick={() => changeZoom(-0.1)} disabled={!hasScore}>
              <Icon name="minus" size={16} />
            </button>
          </Tooltip>
          <span className="w-9 text-center text-xs tabular-nums text-slate-400">{Math.round(zoom * 100)}%</span>
          <Tooltip label="Acercar">
            <button className={iconBtn} onClick={() => changeZoom(0.1)} disabled={!hasScore}>
              <Icon name="plus" size={16} />
            </button>
          </Tooltip>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {onSave && (
            <Tooltip label={dirty ? "Sin guardar" : savedAt ? `Guardado ${savedAt}` : "Guardar"}>
              <button className={`${iconBtn} relative`} onClick={handleSave} disabled={!hasScore || saving} aria-label="Guardar">
                <Icon name="save" size={17} />
                {hasScore && (
                  <span
                    className={`absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-2 ring-ink-800 ${
                      dirty ? "bg-red-500" : "bg-emerald-500"
                    }`}
                  />
                )}
              </button>
            </Tooltip>
          )}
          <Menu
            width={150}
            trigger={
              <Tooltip label="Exportar">
                <button className={iconBtn} disabled={!hasScore} aria-label="Exportar">
                  <Icon name="export" size={17} />
                </button>
              </Tooltip>
            }
          >
            {(close) => (
              <>
                <MenuItem onClick={() => { setPdfModalOpen(true); close(); }}>PDF (avanzado)…</MenuItem>
                <MenuItem onClick={() => { setLyricsPdfOpen(true); close(); }}>Letra (PDF)…</MenuItem>
                <MenuItem onClick={() => { exportGp(); close(); }}>Guitar Pro (.gp)</MenuItem>
                <MenuItem onClick={() => { exportMscz(); close(); }}>MuseScore (.mscz)</MenuItem>
                <MenuItem onClick={() => { exportJson(); close(); }}>Musix (proyecto completo)</MenuItem>
                <MenuItem onClick={() => { setMidiModalOpen(true); close(); }}>MIDI (avanzado)…</MenuItem>
                {canRenderAudio && (
                  <MenuItem onClick={() => { setMp3ModalOpen(true); close(); }}>MP3 (audio)…</MenuItem>
                )}
              </>
            )}
          </Menu>

          <div className="mx-1 h-5 w-px bg-ink-600" />
          <Tooltip label="Configuración del proyecto" side="left">
            <button className={iconBtn} onClick={openSettings} aria-label="Configuración del proyecto">
              <Icon name="settings" size={17} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Título / estado */}
      <div className="flex items-center gap-3 border-b border-ink-600 bg-ink-800/60 px-4 py-1.5 text-xs">
        <span className="truncate font-medium text-slate-300">{scoreTitle}</span>
        {!ready && (source || scoreData) && <span className="ml-auto text-slate-500">Cargando sonido…</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Región izquierda */}
        {leftChildren.length > 0 && (
          <RegionPanel
            side="left"
            size={leftWidth}
            onResize={setLeftWidth}
            collapsed={leftCollapsed}
            onCollapsedChange={setLeftCollapsed}
          >
            {leftChildren}
          </RegionPanel>
        )}

        {/* Columna central: lienzo + región inferior */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={viewportRef}
            style={{ background: "rgb(var(--score-bg))" }}
            className={`min-h-0 flex-1 overflow-auto ${editMode ? "cursor-pointer" : ""}`}
          >
            {!source && !hasScore && (
              <div
                className="flex h-full flex-col items-center justify-center p-8"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragActive(false);
                }}
                onDrop={onFileDrop}
              >
                <input
                  ref={emptyInputRef}
                  type="file"
                  accept=".gp3,.gp4,.gp5,.gpx,.gp,.xml,.musicxml,.cap,.mscz,.mscx,.json,.mu6,.musix"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importTracksFromFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => emptyInputRef.current?.click()}
                  disabled={importing}
                  className={`flex w-full max-w-md flex-col items-center gap-3 rounded-xl border-2 border-dashed px-8 py-12 text-center transition-colors ${
                    dragActive
                      ? "border-accent bg-accent/10 text-accent-soft"
                      : "border-ink-500 text-slate-400 hover:border-accent/60 hover:text-slate-200"
                  } disabled:opacity-50`}
                >
                  <Icon name="upload" size={32} className="opacity-80" />
                  <span className="text-sm font-medium">
                    {importing ? "Cargando…" : "Arrastra un fichero aquí o haz clic para subirlo"}
                  </span>
                  <span className="text-xs text-slate-500">Guitar Pro (.gp, .gp5, .gpx…), MuseScore (.mscz), MusicXML o Capella</span>
                </button>
                {importMsg && (
                  <p className={`mt-3 text-xs ${importMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{importMsg.text}</p>
                )}
              </div>
            )}
            {/* Vista de letra: lee el modelo (acordes + letra), no el SVG de AlphaTab.
                El lienzo de AlphaTab se mantiene montado (oculto) para no perder el audio. */}
            {view.mode === "lyrics" && hasScore && (
              <div className="min-h-full bg-[#fbfaf7]">
                <LyricsView
                  track={pickLyricsTrack()}
                  notation={chordNotation}
                  config={view.lyrics}
                  onConfigChange={(lyrics) => setView({ ...view, lyrics })}
                  playedBeat={playedBeat}
                  version={lyricsVersion}
                  editMode={editMode}
                  onPickBeat={pickBeatFromLyrics}
                />
              </div>
            )}
            <div
              className={`${frameClass(view)} ${view.mode === "lyrics" ? "hidden" : ""}`}
              style={wrapperStyle}
            >
              <div className={`relative ${editMode ? "musix-editing" : ""}`}>
                <div ref={containerRef} />
                {scalesMode &&
                  scaleBoxes.map((b, i) => (
                    <div
                      key={`s${i}`}
                      className="pointer-events-none absolute rounded-sm"
                      style={{
                        left: b.x,
                        top: b.y,
                        width: b.w,
                        height: b.h,
                        backgroundColor: `${b.color}22`,
                        boxShadow: `inset 0 0 0 1.5px ${b.color}99`,
                      }}
                    >
                      {b.label && (
                        <span
                          className="absolute left-0 top-0 rounded-br-sm px-1 py-0.5 text-[10px] font-semibold leading-none text-ink-900"
                          style={{ backgroundColor: b.color }}
                        >
                          {b.label}
                        </span>
                      )}
                    </div>
                  ))}
                {editMode &&
                  incompleteBoxes.map((b, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute rounded-sm border border-red-500/50 bg-red-500/10"
                      style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                      title="Compás incompleto"
                    />
                  ))}
                {editMode &&
                  multiBoxes.map((b, i) => (
                    <div
                      key={`m${i}`}
                      className="pointer-events-none absolute rounded-sm bg-accent/25 ring-1 ring-accent/60"
                      style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                    />
                  ))}
                {editMode && overlay && (
                  <>
                    <div
                      className="pointer-events-none absolute rounded-sm border border-accent/70 bg-accent/10"
                      style={{ left: overlay.box.x, top: overlay.box.y, width: overlay.box.w, height: overlay.box.h }}
                    />
                    <div
                      className="pointer-events-none absolute bg-accent"
                      style={{ left: overlay.caretX, top: overlay.caretY - 1, width: overlay.caretW, height: 2 }}
                    />
                    {overlay.ghost && (
                      <div
                        className="pointer-events-none absolute rounded-full border-2 border-accent bg-accent/30"
                        style={{
                          left: overlay.ghost.x - overlay.ghost.r,
                          top: overlay.ghost.y - overlay.ghost.r,
                          width: overlay.ghost.r * 2,
                          height: overlay.ghost.r * 2,
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          {bottomChildren.length > 0 && (
            <RegionPanel
              side="bottom"
              size={bottomHeight}
              onResize={setBottomHeight}
              collapsed={bottomCollapsed}
              onCollapsedChange={setBottomCollapsed}
            >
              {bottomChildren}
            </RegionPanel>
          )}
        </div>

        {/* Región derecha */}
        {rightChildren.length > 0 && (
          <RegionPanel
            side="right"
            size={rightWidth}
            onResize={setRightWidth}
            collapsed={rightCollapsed}
            onCollapsedChange={setRightCollapsed}
          >
            {rightChildren}
          </RegionPanel>
        )}
      </div>


      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Configuración del proyecto">
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Nombre del proyecto
              </span>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Descripción
              </span>
              <textarea
                value={metaDesc}
                onChange={(e) => setMetaDesc(e.target.value)}
                rows={3}
                placeholder="Notas, intérpretes, contexto…"
                className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
              />
            </label>
            <div className="flex justify-end">
              <button
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 transition-colors hover:brightness-110 disabled:opacity-40"
                onClick={saveMeta}
                disabled={metaSaving || !onUpdateMeta}
              >
                {metaSaving ? "Guardando…" : "Guardar datos"}
              </button>
            </div>
          </div>

          <div className="border-t border-ink-700 pt-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Notación de acordes
              </span>
              <select
                value={chordNotation}
                onChange={(e) => changeChordNotation(e.target.value as ChordNotation)}
                className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
              >
                {NOTATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] leading-snug text-slate-500">
                Cambia el nombre de todos los acordes de la partitura (los personalizados no se
                traducen).
              </span>
            </label>
          </div>

          <div className="border-t border-ink-700 pt-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              {hasScore ? "Añadir pistas" : "Cargar partitura"}
            </div>
            <p className="mb-2 text-xs leading-snug text-slate-400">
              {hasScore
                ? "Sube un fichero (Guitar Pro, MusicXML…). Sus pistas se añaden a las del proyecto actual; no lo reemplazan."
                : "Este proyecto está vacío. Sube un fichero (Guitar Pro, MusicXML…) para empezar."}
            </p>
            <input
              ref={importInputRef}
              type="file"
              accept=".gp3,.gp4,.gp5,.gpx,.gp,.xml,.musicxml,.cap,.mscz,.mscx,.json,.mu6,.musix"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importTracksFromFile(f);
                e.target.value = "";
              }}
            />
            <button
              className={`flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-3 text-sm transition-colors disabled:opacity-40 ${
                dragActive
                  ? "border-accent bg-accent/10 text-accent-soft"
                  : "border-ink-600 bg-ink-700 text-slate-200 hover:border-accent/60 hover:bg-ink-600"
              }`}
              onClick={() => importInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onFileDrop}
              disabled={importing}
            >
              <Icon name="upload" size={16} />
              {importing
                ? hasScore
                  ? "Combinando pistas…"
                  : "Cargando…"
                : hasScore
                  ? "Subir o arrastrar fichero para añadir pistas"
                  : "Subir o arrastrar fichero"}
            </button>
            {importMsg && (
              <p className={`mt-2 text-xs ${importMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                {importMsg.text}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal: texto sobre la posición */}
      <Modal open={annotModal === "text"} onClose={() => setAnnotModal(null)} title="Texto sobre la posición" width={420}>
        <textarea
          autoFocus
          rows={3}
          value={textDraft}
          onChange={(e) => setTextDraft(e.target.value)}
          placeholder="Frase, indicación, letra…"
          className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
        />
        <div className="mt-3 flex justify-between">
          <button
            className="rounded-md bg-ink-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-ink-600 disabled:opacity-40"
            disabled={!selection?.text}
            onClick={() => {
              setBeatText("");
              setAnnotModal(null);
            }}
          >
            Quitar
          </button>
          <button
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110"
            onClick={() => {
              setBeatText(textDraft);
              setAnnotModal(null);
            }}
          >
            Guardar
          </button>
        </div>
      </Modal>

      {/* Modal: letra del pulso (beat.lyrics) */}
      <Modal open={annotModal === "lyric"} onClose={() => setAnnotModal(null)} title="Letra de la posición" width={420}>
        <p className="mb-2 text-xs leading-snug text-slate-400">
          Escribe la sílaba o palabra que cae en este pulso. Se ve en el pentagrama y en la vista de
          letra, alineada con el acorde. Atajo: <b>T</b>.
        </p>
        <input
          autoFocus
          type="text"
          value={lyricDraft}
          onChange={(e) => setLyricDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setBeatLyric(lyricDraft);
              setAnnotModal(null);
            }
          }}
          placeholder="ej. ca-, -mi-, -no…"
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
        />
        <div className="mt-3 flex justify-between">
          <button
            className="rounded-md bg-ink-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-ink-600 disabled:opacity-40"
            disabled={!selection?.lyric}
            onClick={() => {
              setBeatLyric("");
              setAnnotModal(null);
            }}
          >
            Quitar
          </button>
          <button
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110"
            onClick={() => {
              setBeatLyric(lyricDraft);
              setAnnotModal(null);
            }}
          >
            Guardar
          </button>
        </div>
      </Modal>

      {/* Modal: título de sección */}
      <Modal open={annotModal === "section"} onClose={() => setAnnotModal(null)} title="Título de sección" width={420}>
        <p className="mb-2 text-xs leading-snug text-slate-400">
          Marca el inicio de una parte (Estrofa, Estribillo, Puente…). Se muestra en grande y negrita
          sobre el compás.
        </p>
        <input
          autoFocus
          type="text"
          value={sectionDraft}
          onChange={(e) => setSectionDraft(e.target.value)}
          placeholder="Estribillo, Estrofa, Puente…"
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
        />
        <div className="mt-3 flex justify-between">
          <button
            className="rounded-md bg-ink-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-ink-600 disabled:opacity-40"
            disabled={!selection?.section}
            onClick={() => {
              setSection("");
              setAnnotModal(null);
            }}
          >
            Quitar
          </button>
          <button
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110"
            onClick={() => {
              setSection(sectionDraft);
              setAnnotModal(null);
            }}
          >
            Guardar
          </button>
        </div>
      </Modal>

      {/* Modal: acorde (notas + modificadores como botones) */}
      <Modal open={annotModal === "chord"} onClose={() => setAnnotModal(null)} title="Acorde" width={460}>
        <div className="mb-3 flex gap-1">
          <button
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
              chordMode === "known" ? "bg-ink-600 text-slate-100" : "bg-ink-700 text-slate-400 hover:bg-ink-600"
            }`}
            onClick={() => setChordMode("known")}
          >
            Predefinido
          </button>
          <button
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
              chordMode === "custom" ? "bg-ink-600 text-slate-100" : "bg-ink-700 text-slate-400 hover:bg-ink-600"
            }`}
            onClick={() => setChordMode("custom")}
          >
            Personalizado
          </button>
        </div>

        {chordMode === "known" ? (
          <>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Nota</div>
            <div className="mb-3 grid grid-cols-6 gap-1">
              {Array.from({ length: 12 }, (_, r) => (
                <button
                  key={r}
                  className={`rounded px-1 py-1.5 text-xs ${
                    chordDraft.root === r ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-200 hover:bg-ink-600"
                  }`}
                  onClick={() => setChordDraft((d) => ({ ...d, root: r }))}
                >
                  {rootName(r, chordNotation)}
                </button>
              ))}
            </div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Modificador</div>
            <div className="grid grid-cols-4 gap-1">
              {QUALITIES.map((q) => (
                <button
                  key={q.key}
                  className={`rounded px-1 py-1.5 text-xs ${
                    chordDraft.quality === q.key ? "bg-accent text-ink-900" : "bg-ink-700 text-slate-200 hover:bg-ink-600"
                  }`}
                  onClick={() => setChordDraft((d) => ({ ...d, quality: q.key }))}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-slate-400">
                {chordDraft.root != null ? (
                  <>
                    Acorde: <b className="text-slate-100">{chordDisplay(knownChordId(chordDraft.root, chordDraft.quality), chordNotation)}</b>
                  </>
                ) : (
                  "Elige una nota"
                )}
              </span>
              <button
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
                disabled={chordDraft.root == null}
                onClick={() => {
                  if (chordDraft.root != null) applyChord(knownChordId(chordDraft.root, chordDraft.quality));
                  setAnnotModal(null);
                }}
              >
                Aplicar
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              autoFocus
              type="text"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder="Texto libre (p. ej. N.C., Cadd9/E…)"
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
            />
            <p className="mt-1 text-[11px] text-slate-500">Un acorde personalizado no se traduce entre notaciones.</p>
            <div className="mt-3 flex justify-end">
              <button
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
                disabled={!customDraft.trim()}
                onClick={() => {
                  if (customDraft.trim()) applyChord(customChordId(customDraft.trim()));
                  setAnnotModal(null);
                }}
              >
                Aplicar
              </button>
            </div>
          </>
        )}

        {selection?.chordId && (
          <button
            className="mt-3 w-full rounded-md bg-ink-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-ink-600"
            onClick={() => {
              applyChord(null);
              setAnnotModal(null);
            }}
          >
            Quitar acorde actual ({chordDisplay(selection.chordId, chordNotation)})
          </button>
        )}
      </Modal>

      <MidiExportModal
        open={midiModalOpen}
        onClose={() => setMidiModalOpen(false)}
        score={apiRef.current?.score ?? null}
        settings={apiRef.current?.settings ?? null}
        title={title}
      />
      <Mp3ExportModal
        open={mp3ModalOpen}
        onClose={() => setMp3ModalOpen(false)}
        score={apiRef.current?.score ?? null}
        settings={apiRef.current?.settings ?? null}
        title={title}
        trackInstruments={trackInstruments}
        sfzCatalog={sfzCatalog}
      />
      <PdfExportModal
        open={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        score={apiRef.current?.score ?? null}
        tracks={tracks}
        title={title}
      />

      <LyricsPdfModal
        open={lyricsPdfOpen}
        onClose={() => setLyricsPdfOpen(false)}
        track={pickLyricsTrack()}
        notation={chordNotation}
        config={view.lyrics}
        title={scoreTitle || title}
      />

      {/* Modal: círculo de quintas */}
      <Modal open={circleOpen} onClose={() => setCircleOpen(false)} title="Círculo de quintas" width={420}>
        <p className="mb-3 text-xs leading-snug text-slate-400">
          Elige la escala objetivo. El anillo amarillo punteado marca la escala actual de la zona.
        </p>
        <CircleOfFifths
          notation={chordNotation}
          selected={scalePicker}
          current={scaleAt(scaleAssignments, effectiveScope().start)}
          onSelect={(s) => setScalePicker(s)}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          {editMode ? (
            <>
              <button
                className="rounded-md bg-ink-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-ink-600"
                onClick={() => {
                  assignScaleToScope();
                  setCircleOpen(false);
                }}
              >
                Asignar a la zona
              </button>
              <button
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110"
                onClick={() => {
                  setCircleOpen(false);
                  startScaleTranspose();
                }}
              >
                <Icon name="music" size={15} /> Transponer aquí
              </button>
            </>
          ) : (
            <span className="mr-auto text-[11px] text-slate-500">
              Activa el modo edición para asignar o transponer.
            </span>
          )}
        </div>
      </Modal>

      {/* Modal: confirmar transposición por escala */}
      <Modal open={!!scaleTranspose} onClose={() => setScaleTranspose(null)} title="Transponer" width={440}>
        {scaleTranspose && (
          <>
            <p className="text-sm leading-relaxed text-slate-300">
              Vas a cambiar de <b className="text-slate-100">{scaleTranspose.fromLabel}</b> a{" "}
              <b className="text-accent-soft">{scaleTranspose.toLabel}</b>.
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {scaleTranspose.delta === 0 ? (
                <>No hace falta mover ninguna nota (misma tónica); solo se ajustará la armadura.</>
              ) : (
                <>
                  La partitura se moverá{" "}
                  <b className="text-slate-100">
                    {Math.abs(scaleTranspose.delta)} semitono{Math.abs(scaleTranspose.delta) !== 1 ? "s" : ""}{" "}
                    {scaleTranspose.delta > 0 ? "hacia arriba ↑" : "hacia abajo ↓"}
                  </b>
                  .
                </>
              )}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Ámbito:{" "}
              {scaleTranspose.wholePiece
                ? "toda la pieza"
                : `compases ${scaleTranspose.start + 1}–${scaleTranspose.end + 1}`}
              . Se reescriben las notas y la armadura, y la zona queda asignada a la nueva escala.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-md bg-ink-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-ink-600"
                onClick={() => setScaleTranspose(null)}
              >
                Cancelar
              </button>
              <button
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110"
                onClick={applyScaleTranspose}
              >
                Transponer
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Modal: transponer pistas (modifica la partitura y el sonido) */}
      <Modal open={transposeOpen} onClose={() => setTransposeOpen(false)} title="Transponer pistas" width={460}>
        <p className="mb-3 text-xs leading-snug text-slate-400">
          Transpone la <strong>partitura</strong> (notación y sonido) de las pistas elegidas. Es
          reversible y se guarda con el proyecto. Para cambiar solo el tono de reproducción sin tocar
          la partitura, usa el control <em>Pitch</em> de la barra superior.
        </p>

        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Pistas</span>
          <div className="flex gap-2 text-[11px]">
            <button className="text-slate-400 hover:text-accent" onClick={() => setTransposeTargets(new Set(tracks.map((t) => t.index)))}>Todas</button>
            <button className="text-slate-400 hover:text-accent" onClick={() => setTransposeTargets(new Set())}>Ninguna</button>
          </div>
        </div>
        <div className="mb-4 max-h-[30vh] space-y-1 overflow-y-auto pr-1">
          {tracks.map((t) => {
            const checked = transposeTargets.has(t.index);
            return (
              <label key={t.index} className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-600 bg-ink-900/60 px-2.5 py-1.5">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={checked}
                  onChange={(e) =>
                    setTransposeTargets((prev) => {
                      const next = new Set(prev);
                      e.target.checked ? next.add(t.index) : next.delete(t.index);
                      return next;
                    })
                  }
                />
                <span className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/20" style={{ background: colorOf(t.index) }} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{t.name}</span>
              </label>
            );
          })}
        </div>

        <div className="mb-4">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Semitonos</span>
          <div className="flex items-center gap-2">
            <button className="rounded-md bg-ink-700 px-2 py-1.5 text-sm text-slate-200 hover:bg-ink-600" onClick={() => setTransposeSemis((s) => Math.max(-24, s - 1))}>
              <Icon name="minus" size={14} />
            </button>
            <span className={`w-16 text-center text-lg font-semibold tabular-nums ${transposeSemis !== 0 ? "text-accent" : "text-slate-300"}`}>
              {transposeSemis > 0 ? `+${transposeSemis}` : transposeSemis}
            </span>
            <button className="rounded-md bg-ink-700 px-2 py-1.5 text-sm text-slate-200 hover:bg-ink-600" onClick={() => setTransposeSemis((s) => Math.min(24, s + 1))}>
              <Icon name="plus" size={14} />
            </button>
            <div className="ml-2 flex gap-1">
              <button className="rounded bg-ink-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-600" onClick={() => setTransposeSemis((s) => Math.max(-24, s - 12))}>−8va</button>
              <button className="rounded bg-ink-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-600" onClick={() => setTransposeSemis((s) => Math.min(24, s + 12))}>+8va</button>
              <button className="rounded bg-ink-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-600" onClick={() => setTransposeSemis(0)}>0</button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{transposeTargets.size} pista(s) · {transposeSemis > 0 ? `+${transposeSemis}` : transposeSemis} st</span>
          <button
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
            disabled={transposeTargets.size === 0 || transposeSemis === 0}
            onClick={() => {
              transposeTracks([...transposeTargets], transposeSemis);
              setTransposeOpen(false);
            }}
          >
            Transponer
          </button>
        </div>
      </Modal>

      {/* Modal: configuración de una pista (doble clic en el panel) */}
      <Modal
        open={trackModal !== null}
        onClose={() => setTrackModal(null)}
        title="Configuración de pista"
        width={460}
      >
        {trackModal !== null && (() => {
          const idx = trackModal;
          const name = tracks.find((t) => t.index === idx)?.name ?? "";
          const stringed = trackIsStringed(idx);
          // staffRev fuerza la relectura de las opciones tras cambiarlas.
          void staffRev;
          const DISPLAY: { flag: StaffFlag; label: string; hint?: string }[] = [
            { flag: "showStandardNotation", label: "Partitura (pentagrama)" },
            { flag: "showTablature", label: "Tablatura", hint: stringed ? undefined : "(solo instrumentos de cuerda)" },
            { flag: "showSlash", label: "Rítmica (slash)" },
            { flag: "showNumbered", label: "Numerada" },
          ];
          return (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Nombre</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => renameTrack(idx, e.target.value)}
                  className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
                />
              </label>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Color</span>
                  <input
                    type="color"
                    value={colorOf(idx)}
                    onChange={(e) => setTrackColor(idx, e.target.value)}
                    className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Instrumento</span>
                <select
                  className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
                  value={
                    trackInstruments[idx]?.engine === "sfz"
                      ? `I:${(trackInstruments[idx] as { id: string }).id}`
                      : `P:${trackPrograms[idx] ?? 0}`
                  }
                  onChange={(e) => chooseInstrument(idx, e.target.value)}
                >
                  {sfzCatalog.length > 0 &&
                    Array.from(new Set(sfzCatalog.map((s) => s.family))).map((fam) => (
                      <optgroup key={`sfz-${fam}`} label={`◆ ${fam}`}>
                        {sfzCatalog.filter((s) => s.family === fam).map((s) => (
                          <option key={s.id} value={`I:${s.id}`}>{s.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  {GM_FAMILY_ORDER.map((fam) => (
                    <optgroup key={fam} label={fam}>
                      {GM_INSTRUMENTS.filter((g) => g.family === fam).map((g) => (
                        <option key={g.program} value={`P:${g.program}`}>{g.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Qué mostrar</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {DISPLAY.map((d) => (
                    <label
                      key={d.flag}
                      className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-900/60 px-2.5 py-1.5 text-sm text-slate-200"
                    >
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={staffFlag(idx, d.flag)}
                        onChange={(e) => setStaffFlag(idx, d.flag, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        {d.label}
                        {d.hint && <span className="block text-[10px] text-slate-500">{d.hint}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {stringed && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Cejilla (capo)</span>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={staffNumber(idx, "capo")}
                      onChange={(e) => setStaffNumber(idx, "capo", Number(e.target.value))}
                      className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Transp. visual (semitonos)</span>
                    <input
                      type="number"
                      min={-24}
                      max={24}
                      value={staffNumber(idx, "displayTranspositionPitch")}
                      onChange={(e) => setStaffNumber(idx, "displayTranspositionPitch", Number(e.target.value))}
                      className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Descripción</span>
                <textarea
                  rows={2}
                  value={trackDescriptions[idx] ?? ""}
                  onChange={(e) => setTrackDescriptions((m) => ({ ...m, [idx]: e.target.value }))}
                  placeholder="Notas sobre esta pista…"
                  className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
                />
              </label>

              <div className="flex justify-end">
                <button
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-900 hover:brightness-110"
                  onClick={() => setTrackModal(null)}
                >
                  Hecho
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
