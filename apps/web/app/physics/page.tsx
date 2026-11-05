"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import { PhysicsResult, PhysicsScene } from "./types";
import { TrajectoryPlot, EnergyChart } from "./PhysicsCharts";

const STORAGE_KEY = "usl-physics-project-id";
const DISCIPLINE = "physics";

const PRESETS: Record<string, PhysicsScene> = {
  "Caída libre": {
    mass: 1, x0: 0, y0: 10, vx0: 0, vy0: 0,
    gravity_enabled: true, g: 9.81,
    spring_enabled: false, spring_k: 0, spring_anchor_x: 0, spring_anchor_y: 0,
    damping_enabled: false, damping_c: 0,
    duration: 1.4, dt: 0.01,
  },
  "Tiro parabólico": {
    mass: 1, x0: 0, y0: 0, vx0: 8, vy0: 12,
    gravity_enabled: true, g: 9.81,
    spring_enabled: false, spring_k: 0, spring_anchor_x: 0, spring_anchor_y: 0,
    damping_enabled: false, damping_c: 0,
    duration: 2.5, dt: 0.01,
  },
  "Oscilador armónico (resorte)": {
    mass: 1, x0: 2, y0: 0, vx0: 0, vy0: 0,
    gravity_enabled: false, g: 9.81,
    spring_enabled: true, spring_k: 4, spring_anchor_x: 0, spring_anchor_y: 0,
    damping_enabled: false, damping_c: 0,
    duration: 10, dt: 0.01,
  },
  "Oscilador amortiguado": {
    mass: 1, x0: 2, y0: 0, vx0: 0, vy0: 0,
    gravity_enabled: false, g: 9.81,
    spring_enabled: true, spring_k: 4, spring_anchor_x: 0, spring_anchor_y: 0,
    damping_enabled: true, damping_c: 0.5,
    duration: 10, dt: 0.01,
  },
};

export default function PhysicsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<PhysicsScene>(PRESETS["Caída libre"]);
  const [lastRun, setLastRun] = useState<Run<PhysicsResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      api
        .getProject<PhysicsScene>(existing)
        .then((p) => {
          setProject(p);
          if (p.scene && Object.keys(p.scene).length) setScene(p.scene);
          const typedRuns = p.runs as unknown as Run<PhysicsResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const { connected, connectedCount } = useCollaboration<PhysicsScene, PhysicsResult>({
    projectId: project?.id ?? null,
    onSceneUpdated: (scene) => { if (scene && Object.keys(scene).length) setScene(scene); },
    onRunAdded: (run) => setLastRun(run),
  });

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Sistema mecánico", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function field(key: keyof PhysicsScene, value: number | boolean) {
    setScene((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAndRun() {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProject();
      await api.saveScene(p.id, scene as unknown as Record<string, unknown>);
      const run = await api.runProject<PhysicsResult>(p.id);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
    }
  }

  const last = lastRun?.result.series[lastRun.result.series.length - 1];

  return (
    <main>
      <p><Link href="/">← Volver al catálogo</Link></p>
      <h1>Laboratorio de Física <PresenceBadge connected={connected} count={connectedCount} /></h1>
      <p className="subtitle">
        Integración numérica real RK4 de F=ma (gravedad, resorte de Hooke, amortiguamiento lineal), adaptador{" "}
        <span className="badge">physics-mechanics-rk4 v0.1.0</span> · nivel de fidelidad 3/5.
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Presets</h3>
        <div className="row">
          {Object.keys(PRESETS).map((name) => (
            <button key={name} className="secondary" onClick={() => setScene(PRESETS[name])}>{name}</button>
          ))}
        </div>

        <h3>Parámetros</h3>
        <div className="row">
          <label>Masa (kg): <input type="number" value={scene.mass} onChange={(e) => field("mass", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>x0 (m): <input type="number" value={scene.x0} onChange={(e) => field("x0", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>y0 (m): <input type="number" value={scene.y0} onChange={(e) => field("y0", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>vx0 (m/s): <input type="number" value={scene.vx0} onChange={(e) => field("vx0", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>vy0 (m/s): <input type="number" value={scene.vy0} onChange={(e) => field("vy0", Number(e.target.value))} style={{ width: 60 }} /></label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label><input type="checkbox" checked={scene.gravity_enabled} onChange={(e) => field("gravity_enabled", e.target.checked)} /> Gravedad (g={scene.g})</label>
          <label><input type="checkbox" checked={scene.spring_enabled} onChange={(e) => field("spring_enabled", e.target.checked)} /> Resorte k=
            <input type="number" value={scene.spring_k} onChange={(e) => field("spring_k", Number(e.target.value))} style={{ width: 50, marginLeft: 4 }} />
          </label>
          <label><input type="checkbox" checked={scene.damping_enabled} onChange={(e) => field("damping_enabled", e.target.checked)} /> Amortiguamiento c=
            <input type="number" value={scene.damping_c} onChange={(e) => field("damping_c", Number(e.target.value))} style={{ width: 50, marginLeft: 4 }} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label>Duración (s): <input type="number" value={scene.duration} onChange={(e) => field("duration", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>dt (s): <input type="number" step="0.001" value={scene.dt} onChange={(e) => field("dt", Number(e.target.value))} style={{ width: 70 }} /></label>
          <button onClick={saveAndRun} disabled={busy}>{busy ? "Integrando…" : "Guardar y ejecutar"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {lastRun && last && (
        <>
          <section className="panel">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <h3 style={{ marginTop: 0 }}>Trayectoria (x, y)</h3>
                <TrajectoryPlot series={lastRun.result.series} />
              </div>
              <div>
                <h3 style={{ marginTop: 0 }}>Energía vs. tiempo</h3>
                <EnergyChart series={lastRun.result.series} />
              </div>
            </div>
          </section>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Estado final (t = {last.t.toFixed(2)} s, {lastRun.result.steps} pasos RK4)</h3>
            <table>
              <tbody>
                <tr><th>Posición</th><td>x={last.x.toFixed(4)} m, y={last.y.toFixed(4)} m</td></tr>
                <tr><th>Velocidad</th><td>vx={last.vx.toFixed(4)} m/s, vy={last.vy.toFixed(4)} m/s (rapidez {last.speed.toFixed(4)} m/s)</td></tr>
                <tr><th>Energía</th><td>cinética {last.kinetic_energy.toFixed(3)} J, potencial {last.potential_energy.toFixed(3)} J, total {last.total_energy.toFixed(3)} J</td></tr>
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
