"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import ThemeToggle from "../lib/ThemeToggle";
import RunConsole, { ReadoutItem } from "../lib/RunConsole";
import { ArmResult, ArmScene } from "./types";
import ArmScene3D from "./ArmScene3D";

const STORAGE_KEY = "usl-robotics-project-id";
const DISCIPLINE = "robotics";
const MIN_ENERGIZE_MS = 900;

const DEFAULT_SCENE: ArmScene = { l1: 5, l2: 3, target_x: 4, target_y: 4, elbow: "up" };

export default function RoboticsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<ArmScene>(DEFAULT_SCENE);
  const [lastRun, setLastRun] = useState<Run<ArmResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [energizing, setEnergizing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
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
    setEnergizing(true);
    try {
      const p = await ensureProject();
      const toSave = overrideScene ?? sceneRef.current;
      await api.saveScene(p.id, toSave as unknown as Record<string, unknown>);
      const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_ENERGIZE_MS));
      const [run] = await Promise.all([api.runProject<ArmResult>(p.id), minDelay]);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setEnergizing(false);
    }
  }

  const has3 = scene.l3 != null && scene.l3 > 0;

  return (
    <main className="lab-robotics">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <div className="lab-topbar">
        <h1>Laboratorio de Robótica <PresenceBadge connected={connected} count={connectedCount} /></h1>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => setInfoOpen((v) => !v)} title="Sobre este laboratorio">
            <Info size={16} />
          </button>
          <ThemeToggle />
        </div>
      </div>
      {infoOpen && (
        <p className="subtitle info-popover">
          Brazo planar arrastrable en 3D: agarrá la esfera roja (objetivo) y soltala donde quieras — el adaptador
          recalcula la cinemática inversa exacta (ley de cosenos, 2 eslabones; desacople posición/orientación, 3
          eslabones), adaptador <span className="badge">robotics-arm2-kinematics v0.2.0</span> · nivel de
          fidelidad 3/5. Sin dinámica (masas, torques, motores).
        </p>
      )}

      <section className="lab-console">
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
          <button onClick={() => saveAndRun()} disabled={busy}>
            {energizing ? "Energizando…" : busy ? "Resolviendo…" : "Guardar y ejecutar"}
          </button>
        </div>

        <ArmScene3D
          scene={scene}
          result={lastRun?.result ?? null}
          energizing={energizing}
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
          <RunConsole
            items={[
              { id: "theta1", label: "θ1", value: lastRun.result.theta1_deg, decimals: 3, unit: "°", status: "good" },
              { id: "theta2", label: "θ2", value: lastRun.result.theta2_deg, decimals: 3, unit: "°", status: "good" },
              ...(lastRun.result.link_count === 3
                ? [{ id: "theta3", label: "θ3", value: lastRun.result.theta3_deg ?? 0, decimals: 3, unit: "°", status: "good" } satisfies ReadoutItem]
                : []),
            ]}
          />
          {/* Scientific-notation verification error doesn't belong on a fixed-decimal
              instrument digit — kept as plain mono text instead of forcing it into one. */}
          <p className="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 10 }}>
            Efector final (FK): ({lastRun.result.end_effector.x.toFixed(4)}, {lastRun.result.end_effector.y.toFixed(4)}) ·
            {" "}Objetivo: ({lastRun.result.target.x.toFixed(4)}, {lastRun.result.target.y.toFixed(4)}) ·
            {" "}Error FK↔IK (posición): {lastRun.result.fk_verification_error.toExponential(2)}
            {lastRun.result.link_count === 3 && <> · Error FK↔IK (orientación): {lastRun.result.fk_orientation_error_deg?.toExponential(2)}°</>}
            {" "}· Espacio de trabajo: r ∈ [{lastRun.result.workspace.r_min.toFixed(2)}, {lastRun.result.workspace.r_max.toFixed(2)}]
          </p>
        </section>
      )}

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}
