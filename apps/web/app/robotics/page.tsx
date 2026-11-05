"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import { ArmResult, ArmScene } from "./types";
import ArmScene3D from "./ArmScene3D";

const STORAGE_KEY = "usl-robotics-project-id";
const DISCIPLINE = "robotics";

const DEFAULT_SCENE: ArmScene = { l1: 5, l2: 3, target_x: 4, target_y: 4, elbow: "up" };

export default function RoboticsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<ArmScene>(DEFAULT_SCENE);
  const [lastRun, setLastRun] = useState<Run<ArmResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      api
        .getProject(existing)
        .then((p) => {
          setProject(p);
          if (p.scene && Object.keys(p.scene).length) setScene(p.scene as unknown as ArmScene);
          const typedRuns = p.runs as unknown as Run<ArmResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const { connected, connectedCount } = useCollaboration<ArmScene, ArmResult>({
    projectId: project?.id ?? null,
    onSceneUpdated: (scene) => { if (scene && Object.keys(scene).length) setScene(scene); },
    onRunAdded: (run) => setLastRun(run),
  });

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Brazo robótico", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function field(key: keyof ArmScene, value: number | string | null) {
    setScene((prev) => ({ ...prev, [key]: value }));
  }

  function moveTarget(x: number, y: number) {
    setScene((prev) => ({ ...prev, target_x: x, target_y: y }));
  }

  function toggleLink3(enabled: boolean) {
    setScene((prev) => ({
      ...prev,
      l3: enabled ? 2 : null,
      target_phi_deg: enabled ? 0 : null,
    }));
  }

  async function saveAndRun(overrideScene?: ArmScene) {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProject();
      const toSave = overrideScene ?? sceneRef.current;
      await api.saveScene(p.id, toSave as unknown as Record<string, unknown>);
      const run = await api.runProject<ArmResult>(p.id);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const has3 = scene.l3 != null && scene.l3 > 0;

  return (
    <main className="lab-robotics">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <h1>Laboratorio de Robótica <PresenceBadge connected={connected} count={connectedCount} /></h1>
      <p className="subtitle">
        Brazo planar arrastrable en 3D: agarrá la esfera roja (objetivo) y soltala donde quieras — el adaptador
        recalcula la cinemática inversa exacta (ley de cosenos, 2 eslabones; desacople posición/orientación, 3
        eslabones), adaptador <span className="badge">robotics-arm2-kinematics v0.2.0</span> · nivel de
        fidelidad 3/5. Sin dinámica (masas, torques, motores).
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Brazo</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <label>l1: <input type="number" value={scene.l1} onChange={(e) => field("l1", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>l2: <input type="number" value={scene.l2} onChange={(e) => field("l2", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>Codo:
            <select value={scene.elbow} onChange={(e) => field("elbow", e.target.value)} style={{ marginLeft: 6 }}>
              <option value="up">Arriba</option>
              <option value="down">Abajo</option>
            </select>
          </label>
          <label className="row">
            <input type="checkbox" checked={has3} onChange={(e) => toggleLink3(e.target.checked)} />
            3er eslabón
          </label>
          {has3 && (
            <label>l3: <input type="number" value={scene.l3 ?? 2} onChange={(e) => field("l3", Number(e.target.value))} style={{ width: 60 }} /></label>
          )}
          <button onClick={() => saveAndRun()} disabled={busy}>{busy ? "Resolviendo…" : "Guardar y ejecutar"}</button>
        </div>

        <ArmScene3D
          scene={scene}
          result={lastRun?.result ?? null}
          onTargetDrag={moveTarget}
          onPhiDrag={(phiDeg) => field("target_phi_deg", phiDeg)}
          onDragEnd={() => saveAndRun()}
        />
        <p className="canvas-hint">
          Arrastrá la esfera roja para mover el objetivo{has3 ? " · arrastrá el cono amarillo para rotar la orientación del efector final" : ""}.
          Al soltar, se guarda y ejecuta automáticamente.
        </p>
        <div className="row" style={{ marginTop: 6 }}>
          <label>objetivo x: <input type="number" value={scene.target_x} onChange={(e) => field("target_x", Number(e.target.value))} style={{ width: 70 }} /></label>
          <label>objetivo y: <input type="number" value={scene.target_y} onChange={(e) => field("target_y", Number(e.target.value))} style={{ width: 70 }} /></label>
          {has3 && <label>φ: <input type="number" value={scene.target_phi_deg ?? 0} onChange={(e) => field("target_phi_deg", Number(e.target.value))} style={{ width: 70 }} />°</label>}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {lastRun && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Resultado</h3>
          <table>
            <tbody>
              <tr><th>θ1</th><td>{lastRun.result.theta1_deg.toFixed(3)}°</td></tr>
              <tr><th>θ2</th><td>{lastRun.result.theta2_deg.toFixed(3)}°</td></tr>
              {lastRun.result.link_count === 3 && <tr><th>θ3</th><td>{lastRun.result.theta3_deg?.toFixed(3)}°</td></tr>}
              <tr><th>Efector final (FK)</th><td>({lastRun.result.end_effector.x.toFixed(4)}, {lastRun.result.end_effector.y.toFixed(4)})</td></tr>
              <tr><th>Objetivo</th><td>({lastRun.result.target.x.toFixed(4)}, {lastRun.result.target.y.toFixed(4)})</td></tr>
              <tr><th>Error de verificación FK↔IK (posición)</th><td>{lastRun.result.fk_verification_error.toExponential(2)}</td></tr>
              {lastRun.result.link_count === 3 && (
                <tr><th>Error de verificación FK↔IK (orientación)</th><td>{lastRun.result.fk_orientation_error_deg?.toExponential(2)}°</td></tr>
              )}
              <tr><th>Espacio de trabajo (l1+l2)</th><td>r ∈ [{lastRun.result.workspace.r_min.toFixed(2)}, {lastRun.result.workspace.r_max.toFixed(2)}]</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}
