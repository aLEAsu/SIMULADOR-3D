"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import InteractiveCanvas, { CanvasLink, Piece } from "../lib/InteractiveCanvas";
import { CircuitComponent, CircuitResult, CircuitScene } from "./types";
import {
  PIECE_TYPES, GROUND_PIECE_TYPE, defaultProps,
  sceneFromCanvas, canvasFromScene, CanvasPieceWithProps,
} from "./canvasAdapter";

const STORAGE_KEY = "usl-electronics-project-id";
const DISCIPLINE = "electronics";

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
    try {
      const p = await ensureProject();
      const scene = sceneFromCanvas(pieces, wires);
      await api.saveScene(p.id, scene as unknown as Record<string, unknown>);
      const run = await api.runProject<CircuitResult>(p.id);
      setLastRun(run);
      const allRuns = await api.listRuns<CircuitResult>(p.id);
      setRuns(allRuns);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
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

  return (
    <main className="lab-electronics">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <h1>Laboratorio de Electrónica <PresenceBadge connected={connected} count={connectedCount} /></h1>
      <p className="subtitle">
        Protoboard interactivo real: arrastrá piezas, conectalas entre terminales y ejecutá el análisis nodal DC
        (NumPy), adaptador <span className="badge">electronics-dc v0.2.0</span> · nivel de fidelidad 3/5.
        No es una animación: cambiá un valor o la posición de un cable y volvé a ejecutar para comprobarlo.
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Protoboard</h3>
        <InteractiveCanvas
          pieceTypes={[...PIECE_TYPES, GROUND_PIECE_TYPE]}
          pieces={renderPieces}
          links={canvasLinks}
          selectedUid={selectedUid}
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
          <button onClick={saveAndRun} disabled={busy}>{busy ? "Ejecutando…" : "Guardar y ejecutar"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {lastRun && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Resultados (última corrida)</h3>
          <table>
            <thead><tr><th>Componente</th><th>Tipo</th><th>Voltaje</th><th>Corriente</th><th>Potencia</th><th>Estado</th></tr></thead>
            <tbody>
              {lastRun.result.components.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.type}</td>
                  <td>{r.voltage.toFixed(3)} V</td>
                  <td>{(r.current * 1000).toFixed(2)} mA</td>
                  <td>{(r.power * 1000).toFixed(2)} mW</td>
                  <td>{r.type === "led" ? (r.on ? "encendido" : "apagado") : r.type === "switch" ? (r.closed ? "cerrado" : "abierto") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {runs.length > 1 && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Comparación de corridas ({runs.length})</h3>
          <table>
            <thead><tr><th>#</th><th>Componentes modificados</th><th>Voltajes de nodo</th></tr></thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{(r.scene as unknown as CircuitScene).components.map((c) => `${c.id}=${c.value}`).join(", ")}</td>
                  <td>{Object.entries(r.result.node_voltages).map(([n, v]) => `${n}=${v.toFixed(2)}V`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}
