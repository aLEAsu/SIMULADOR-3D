"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import ThemeToggle from "../lib/ThemeToggle";
import InteractiveCanvas, { CanvasLink, Piece } from "../lib/InteractiveCanvas";
import RunConsole, { ReadoutItem } from "../lib/RunConsole";
import RunFilmstrip, { FilmstripRun } from "../lib/RunFilmstrip";
import { CircuitComponent, CircuitResult, CircuitScene } from "./types";
import {
  PIECE_TYPES, GROUND_PIECE_TYPE, defaultProps,
  sceneFromCanvas, canvasFromScene, CanvasPieceWithProps,
} from "./canvasAdapter";

const STORAGE_KEY = "usl-electronics-project-id";
const DISCIPLINE = "electronics";
// The console plays its "energizing" pulse for at least this long so the
// transition is actually visible even when the real backend answers in a
// few milliseconds — purely cosmetic pacing, the number shown afterwards
// is always exactly what the solver returned, never anything from this delay.
const MIN_ENERGIZE_MS = 900;

const SAMPLE_SCENE: CircuitScene = {
  components: [
    { id: "v1", type: "dc_source", node_a: "n1", node_b: "gnd", value: 10 },
    { id: "r1", type: "resistor", node_a: "n1", node_b: "n2", value: 100 },
    { id: "r2", type: "resistor", node_a: "n2", node_b: "gnd", value: 100 },
  ],
};

let uidCounter = 1;
function nextUid(type: string) {
  return `${type}${uidCounter++}`;
}

function unitFor(type: string): string {
  switch (type) {
    case "resistor": return "Ω";
    case "dc_source": return "V";
    case "capacitor": return "F";
    default: return "";
  }
}

export default function ElectronicsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [pieces, setPieces] = useState<CanvasPieceWithProps[]>(() => canvasFromScene(SAMPLE_SCENE).pieces);
  const [wires, setWires] = useState(() => canvasFromScene(SAMPLE_SCENE).wires);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Run<CircuitResult> | null>(null);
  const [runs, setRuns] = useState<Run<CircuitResult>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [energizing, setEnergizing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  function loadScene(scene: CircuitScene) {
    const { pieces: p, wires: w } = canvasFromScene(scene);
    setPieces(p);
    setWires(w);
  }

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      api
        .getProject(existing)
        .then((p) => {
          setProject(p);
          const scene = p.scene as unknown as CircuitScene;
          if (scene.components?.length) loadScene(scene);
          const typedRuns = p.runs as unknown as Run<CircuitResult>[];
          setRuns(typedRuns);
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const { connected, connectedCount } = useCollaboration<CircuitScene, CircuitResult>({
    projectId: project?.id ?? null,
    onSceneUpdated: (scene) => { if (scene.components?.length) loadScene(scene); },
    onRunAdded: (run) => {
      setLastRun(run);
      setRuns((prev) => (prev.some((r) => r.id === run.id) ? prev : [...prev, run]));
    },
  });

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Circuito de electrónica", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function placePiece(type: string, x: number, y: number) {
    const uid = nextUid(type);
    setPieces((prev) => [...prev, { uid, type, x, y, rotation: 0, props: defaultProps(type as CircuitComponent["type"]) }]);
    setSelectedUid(uid);
  }

  function movePiece(uid: string, x: number, y: number) {
    setPieces((prev) => prev.map((p) => (p.uid === uid ? { ...p, x, y } : p)));
  }

  function rotatePiece(uid: string) {
    setPieces((prev) => prev.map((p) => (p.uid === uid ? { ...p, rotation: ((p.rotation ?? 0) + 90) % 360 } : p)));
  }

  function deletePiece(uid: string) {
    setPieces((prev) => prev.filter((p) => p.uid !== uid));
    setWires((prev) => prev.filter((w) => w.fromUid !== uid && w.toUid !== uid));
    setSelectedUid((s) => (s === uid ? null : s));
  }

  function linkTerminals(fromUid: string, fromTerminal: string, toUid: string, toTerminal: string) {
    if (fromUid === toUid && fromTerminal === toTerminal) return;
    setWires((prev) => {
      const dup = prev.some(
        (w) =>
          (w.fromUid === fromUid && w.fromTerminal === fromTerminal && w.toUid === toUid && w.toTerminal === toTerminal) ||
          (w.fromUid === toUid && w.fromTerminal === toTerminal && w.toUid === fromUid && w.toTerminal === fromTerminal)
      );
      if (dup) return prev;
      return [...prev, { id: `w${Date.now()}${Math.random().toString(36).slice(2, 6)}`, fromUid, fromTerminal, toUid, toTerminal }];
    });
  }

  function deleteWire(id: string) {
    setWires((prev) => prev.filter((w) => w.id !== id));
  }

  function updateSelectedProps(patch: Partial<CircuitComponent>) {
    setPieces((prev) => prev.map((p) => (p.uid === selectedUid ? { ...p, props: { ...p.props, ...patch } } : p)));
  }

  async function saveAndRun() {
    setBusy(true);
    setError(null);
    setEnergizing(true);
    try {
      const p = await ensureProject();
      const scene = sceneFromCanvas(pieces, wires);
      await api.saveScene(p.id, scene as unknown as Record<string, unknown>);
      const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_ENERGIZE_MS));
      const [run] = await Promise.all([api.runProject<CircuitResult>(p.id), minDelay]);
      setLastRun(run);
      const allRuns = await api.listRuns<CircuitResult>(p.id);
      setRuns(allRuns);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
      setEnergizing(false);
    }
  }

  const selectedPiece = pieces.find((p) => p.uid === selectedUid);
  const selectedType = selectedPiece?.type as CircuitComponent["type"] | "ground" | undefined;
  const resultById = new Map((lastRun?.result.components ?? []).map((c) => [c.id, c]));

  const renderPieces: Piece[] = pieces.map((p) => {
    const r = resultById.get(p.uid);
    let badge: string | undefined;
    let state: Piece["state"] = "default";
    if (r) {
      if (r.type === "led") {
        badge = r.on ? `${(r.current * 1000).toFixed(1)}mA` : "apagado";
        state = r.on ? "good" : "default";
      } else if (r.type === "switch") {
        badge = r.closed ? "cerrado" : "abierto";
      } else {
        badge = `${r.voltage.toFixed(2)}V`;
        state = "good";
      }
    }
    if (p.uid === selectedUid) state = "selected";
    return { ...p, badge, state };
  });

  const canvasLinks: CanvasLink[] = wires.map((w) => ({ ...w }));

  const readoutItems: ReadoutItem[] = (lastRun?.result.components ?? []).map((r) => ({
    id: r.id,
    label: `${r.id} · ${r.type}`,
    value: r.voltage,
    decimals: 3,
    unit: "V",
    secondary: `${(r.current * 1000).toFixed(2)} mA · ${(r.power * 1000).toFixed(2)} mW`,
    status: r.type === "led" ? (r.on ? "good" : "neutral") : "good",
    statusLabel:
      r.type === "led" ? (r.on ? "encendido" : "apagado") : r.type === "switch" ? (r.closed ? "cerrado" : "abierto") : undefined,
  }));

  const filmstripRuns: FilmstripRun[] = runs.map((r, i) => ({
    id: r.id,
    index: i + 1,
    changedSummary: (r.scene as unknown as CircuitScene).components.map((c) => `${c.id}=${c.value}`).join(", "),
    readoutSummary: Object.entries(r.result.node_voltages).map(([n, v]) => `${n}=${v.toFixed(2)}V`).join(", "),
  }));

  return (
    <main className="lab-electronics lab-console-page">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <div className="lab-topbar">
        <h1>Laboratorio de Electrónica <PresenceBadge connected={connected} count={connectedCount} /></h1>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => setInfoOpen((v) => !v)} title="Sobre este laboratorio">
            <Info size={16} />
          </button>
          <ThemeToggle />
        </div>
      </div>
      {infoOpen && (
        <p className="subtitle info-popover">
          Protoboard interactivo real: arrastrá piezas, conectalas entre terminales y ejecutá el análisis nodal DC
          (NumPy), adaptador <span className="badge">electronics-dc v0.2.0</span> · nivel de fidelidad 3/5.
          No es una animación: cambiá un valor o la posición de un cable y volvé a ejecutar para comprobarlo.
        </p>
      )}

      <section className="lab-console">
        <InteractiveCanvas
          pieceTypes={[...PIECE_TYPES, GROUND_PIECE_TYPE]}
          pieces={renderPieces}
          links={canvasLinks}
          selectedUid={selectedUid}
          gridStyle="breadboard"
          paletteDocked
          energizing={energizing}
          onPlace={placePiece}
          onMove={movePiece}
          onRotate={rotatePiece}
          onSelect={setSelectedUid}
          onDelete={deletePiece}
          onLink={linkTerminals}
          onLinkDelete={deleteWire}
        />

        {selectedPiece && selectedType && selectedType !== "ground" && (
          <div className="props-panel">
            <strong>{selectedPiece.uid}</strong>
            {selectedType !== "switch" && selectedType !== "led" && (
              <label>
                Valor
                <input
                  type="number"
                  value={selectedPiece.props.value ?? 0}
                  onChange={(e) => updateSelectedProps({ value: Number(e.target.value) })}
                />
                <span className="unit">{unitFor(selectedType)}</span>
              </label>
            )}
            {selectedType === "switch" && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={selectedPiece.props.closed ?? true}
                  onChange={(e) => updateSelectedProps({ closed: e.target.checked })}
                />
                Cerrado (conduce)
              </label>
            )}
            {selectedType === "led" && (
              <>
                <label>
                  Vf <input type="number" step="0.1" value={selectedPiece.props.forward_voltage ?? 2} onChange={(e) => updateSelectedProps({ forward_voltage: Number(e.target.value) })} /> V
                </label>
                <label>
                  Ron <input type="number" value={selectedPiece.props.forward_resistance ?? 10} onChange={(e) => updateSelectedProps({ forward_resistance: Number(e.target.value) })} /> Ω
                </label>
              </>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={saveAndRun} disabled={busy}>
            {energizing ? "Energizando…" : busy ? "Ejecutando…" : "Guardar y ejecutar"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Lecturas (última corrida)</h3>
        <RunConsole items={readoutItems} />
      </section>

      {filmstripRuns.length > 1 && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Comparación de corridas ({filmstripRuns.length})</h3>
          <RunFilmstrip runs={filmstripRuns} />
        </section>
      )}

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}
