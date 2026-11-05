"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { ArmResult, ArmScene } from "./types";
import ArmDiagram from "./ArmDiagram";

const STORAGE_KEY = "usl-robotics-project-id";
const DISCIPLINE = "robotics";

const DEFAULT_SCENE: ArmScene = { l1: 5, l2: 3, target_x: 4, target_y: 4, elbow: "up" };

export default function RoboticsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<ArmScene>(DEFAULT_SCENE);
  const [lastRun, setLastRun] = useState<Run<ArmResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      api
        .getProject<ArmScene>(existing)
        .then((p) => {
          setProject(p);
          if (p.scene && Object.keys(p.scene).length) setScene(p.scene);
          const typedRuns = p.runs as unknown as Run<ArmResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Brazo robótico 2 eslabones", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function field(key: keyof ArmScene, value: number | string) {
    setScene((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAndRun() {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProject();
      await api.saveScene(p.id, scene as unknown as Record<string, unknown>);
      const run = await api.runProject<ArmResult>(p.id);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <p><Link href="/">← Volver al catálogo</Link></p>
      <h1>Laboratorio de Robótica</h1>
      <p className="subtitle">
        Cinemática inversa exacta (ley de cosenos) de un brazo planar de 2 eslabones, verificada por cinemática
        directa, adaptador <span className="badge">robotics-arm2-kinematics v0.1.0</span> · nivel de fidelidad 3/5.
        Solo cinemática — sin dinámica (masas, torques, motores) ni motor físico (Webots/MuJoCo quedan por
        evaluar para una fase posterior, ver docs/02-roadmap.md).
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Eslabones</h3>
        <div className="row">
          <label>l1: <input type="number" value={scene.l1} onChange={(e) => field("l1", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>l2: <input type="number" value={scene.l2} onChange={(e) => field("l2", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>Codo:
            <select value={scene.elbow} onChange={(e) => field("elbow", e.target.value)} style={{ marginLeft: 6 }}>
              <option value="up">Arriba</option>
              <option value="down">Abajo</option>
            </select>
          </label>
        </div>

        <h3>Objetivo del efector final</h3>
        <div className="row">
          <label>x: <input type="number" value={scene.target_x} onChange={(e) => field("target_x", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>y: <input type="number" value={scene.target_y} onChange={(e) => field("target_y", Number(e.target.value))} style={{ width: 60 }} /></label>
          <button onClick={saveAndRun} disabled={busy}>{busy ? "Resolviendo…" : "Guardar y ejecutar"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {lastRun && (
        <>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Diagrama</h3>
            <ArmDiagram result={lastRun.result} />
          </section>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Resultado</h3>
            <table>
              <tbody>
                <tr><th>θ1</th><td>{lastRun.result.theta1_deg.toFixed(3)}°</td></tr>
                <tr><th>θ2</th><td>{lastRun.result.theta2_deg.toFixed(3)}°</td></tr>
                <tr><th>Articulación 1</th><td>({lastRun.result.joint1.x.toFixed(4)}, {lastRun.result.joint1.y.toFixed(4)})</td></tr>
                <tr><th>Efector final (FK)</th><td>({lastRun.result.end_effector.x.toFixed(4)}, {lastRun.result.end_effector.y.toFixed(4)})</td></tr>
                <tr><th>Objetivo</th><td>({lastRun.result.target.x.toFixed(4)}, {lastRun.result.target.y.toFixed(4)})</td></tr>
                <tr><th>Error de verificación FK↔IK</th><td>{lastRun.result.fk_verification_error.toExponential(2)}</td></tr>
                <tr><th>Espacio de trabajo</th><td>r ∈ [{lastRun.result.workspace.r_min.toFixed(2)}, {lastRun.result.workspace.r_max.toFixed(2)}]</td></tr>
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
