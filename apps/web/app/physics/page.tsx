"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import ThemeToggle from "../lib/ThemeToggle";
import RunConsole from "../lib/RunConsole";
import { PhysicsResult, PhysicsScene } from "./types";
import { TrajectoryPlot, EnergyChart } from "./PhysicsCharts";
import PhysicsScene3D from "./PhysicsScene3D";

const STORAGE_KEY = "usl-physics-project-id";
const DISCIPLINE = "physics";
const MIN_ENERGIZE_MS = 900;

const BASE: PhysicsScene = {
  mode: "point_mass", mass: 1, x0: 0, y0: 10, vx0: 0, vy0: 0,
  gravity_enabled: true, g: 9.81,
  spring_enabled: false, spring_k: 0, spring_anchor_x: 0, spring_anchor_y: 0,
  damping_enabled: false, damping_c: 0,
  duration: 1.4, dt: 0.01,
  pendulum_length: 2, pendulum_theta0_deg: 30, pendulum_omega0_deg_s: 0,
  incline_angle_deg: 30, incline_friction_mu: 0, incline_s0: 0, incline_v0: 0,
};

const PRESETS: Record<string, Partial<PhysicsScene>> = {
  "Caída libre": { mode: "point_mass", y0: 10, vx0: 0, vy0: 0, gravity_enabled: true, spring_enabled: false, damping_enabled: false, duration: 1.4 },
  "Tiro parabólico": { mode: "point_mass", x0: 0, y0: 0, vx0: 8, vy0: 12, gravity_enabled: true, spring_enabled: false, damping_enabled: false, duration: 2.5 },
  "Oscilador armónico (resorte)": { mode: "point_mass", x0: 2, y0: 0, vx0: 0, vy0: 0, gravity_enabled: false, spring_enabled: true, spring_k: 4, damping_enabled: false, duration: 10 },
  "Oscilador amortiguado": { mode: "point_mass", x0: 2, y0: 0, gravity_enabled: false, spring_enabled: true, spring_k: 4, damping_enabled: true, damping_c: 0.5, duration: 10 },
  "Péndulo simple": { mode: "pendulum", pendulum_length: 2, pendulum_theta0_deg: 30, pendulum_omega0_deg_s: 0, damping_c: 0, duration: 6 },
  "Péndulo amortiguado": { mode: "pendulum", pendulum_length: 2, pendulum_theta0_deg: 45, damping_c: 0.3, duration: 10 },
  "Plano inclinado (sin fricción)": { mode: "incline", incline_angle_deg: 30, incline_friction_mu: 0, duration: 2 },
  "Plano inclinado (con fricción)": { mode: "incline", incline_angle_deg: 30, incline_friction_mu: 0.25, duration: 2 },
};

export default function PhysicsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<PhysicsScene>(BASE);
  const [lastRun, setLastRun] = useState<Run<PhysicsResult> | null>(null);
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
          if (p.scene && Object.keys(p.scene).length) setScene({ ...BASE, ...(p.scene as unknown as PhysicsScene) });
          const typedRuns = p.runs as unknown as Run<PhysicsResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const { connected, connectedCount } = useCollaboration<PhysicsScene, PhysicsResult>({
    projectId: project?.id ?? null,
    onSceneUpdated: (s) => { if (s && Object.keys(s).length) setScene({ ...BASE, ...s }); },
    onRunAdded: (run) => setLastRun(run),
  });

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Sistema mecánico", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function field(key: keyof PhysicsScene, value: number | boolean | string) {
    setScene((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAndRun(overrideScene?: PhysicsScene) {
    setBusy(true);
    setError(null);
    setEnergizing(true);
    try {
      const p = await ensureProject();
      const toSave = overrideScene ?? sceneRef.current;
      await api.saveScene(p.id, toSave as unknown as Record<string, unknown>);
      const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_ENERGIZE_MS));
      const [run] = await Promise.all([api.runProject<PhysicsResult>(p.id), minDelay]);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
      setEnergizing(false);
    }
  }

  const series = lastRun?.result.series;
  const last = series?.[series.length - 1];

  return (
    <main className="lab-physics">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <div className="lab-topbar">
        <h1>Laboratorio de Física <PresenceBadge connected={connected} count={connectedCount} /></h1>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => setInfoOpen((v) => !v)} title="Sobre este laboratorio">
            <Info size={16} />
          </button>
          <ThemeToggle />
        </div>
      </div>
      {infoOpen && (
        <p className="subtitle info-popover">
          Integración numérica real RK4 (masa libre, péndulo no lineal, plano inclinado con fricción cinética),
          adaptador <span className="badge">physics-mechanics-rk4 v0.2.0</span> · nivel de fidelidad 3/5. Agarrá la
          masa (o el péndulo) en la escena 3D y soltala donde quieras.
        </p>
      )}

      <section className="lab-console">
        <h3 style={{ marginTop: 0 }}>Presets</h3>
        <div className="row">
          {Object.keys(PRESETS).map((name) => (
            <button key={name} className="secondary" onClick={() => setScene({ ...BASE, ...PRESETS[name] })}>{name}</button>
          ))}
        </div>

        <h3>Modo</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <select value={scene.mode} onChange={(e) => field("mode", e.target.value)}>
            <option value="point_mass">Masa libre (gravedad / resorte / amortiguamiento)</option>
            <option value="pendulum">Péndulo simple</option>
            <option value="incline">Plano inclinado</option>
          </select>
          <button onClick={() => saveAndRun()} disabled={busy}>
            {energizing ? "Energizando…" : busy ? "Integrando…" : "Guardar y ejecutar"}
          </button>
        </div>

        <PhysicsScene3D
          scene={scene}
          result={lastRun?.result ?? null}
          energizing={energizing}
          onMassDrag={(x, y) => setScene((prev) => ({ ...prev, x0: x, y0: y }))}
          onAnchorDrag={(x, y) => setScene((prev) => ({ ...prev, spring_anchor_x: x, spring_anchor_y: y }))}
          onPendulumDrag={(thetaDeg) => field("pendulum_theta0_deg", thetaDeg)}
          onDragEnd={() => saveAndRun()}
        />
        <p className="canvas-hint">
          {scene.mode === "point_mass" && "Arrastrá la esfera roja (posición inicial) o la amarilla (ancla del resorte, si está activo)."}
          {scene.mode === "pendulum" && "Arrastrá la esfera roja (el péndulo) para fijar el ángulo inicial."}
          {scene.mode === "incline" && "Ajustá el ángulo y la fricción con los controles — el plano se ve en la escena."}
          {" "}Al soltar, se guarda y ejecuta automáticamente.
        </p>

        {scene.mode === "point_mass" && (
          <>
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
          </>
        )}
        {scene.mode === "pendulum" && (
          <div className="row">
            <label>Longitud L (m): <input type="number" value={scene.pendulum_length} onChange={(e) => field("pendulum_length", Number(e.target.value))} style={{ width: 60 }} /></label>
            <label>θ0 (°): <input type="number" value={scene.pendulum_theta0_deg} onChange={(e) => field("pendulum_theta0_deg", Number(e.target.value))} style={{ width: 60 }} /></label>
            <label>ω0 (°/s): <input type="number" value={scene.pendulum_omega0_deg_s} onChange={(e) => field("pendulum_omega0_deg_s", Number(e.target.value))} style={{ width: 60 }} /></label>
            <label>Amortig. angular c: <input type="number" step="0.1" value={scene.damping_c} onChange={(e) => field("damping_c", Number(e.target.value))} style={{ width: 60 }} /></label>
          </div>
        )}
        {scene.mode === "incline" && (
          <div className="row">
            <label>Ángulo (°): <input type="number" value={scene.incline_angle_deg} onChange={(e) => field("incline_angle_deg", Number(e.target.value))} style={{ width: 60 }} /></label>
            <label>Fricción μ: <input type="number" step="0.05" value={scene.incline_friction_mu} onChange={(e) => field("incline_friction_mu", Number(e.target.value))} style={{ width: 60 }} /></label>
            <label>s0 (m): <input type="number" value={scene.incline_s0} onChange={(e) => field("incline_s0", Number(e.target.value))} style={{ width: 60 }} /></label>
            <label>v0 (m/s): <input type="number" value={scene.incline_v0} onChange={(e) => field("incline_v0", Number(e.target.value))} style={{ width: 60 }} /></label>
          </div>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <label>Duración (s): <input type="number" value={scene.duration} onChange={(e) => field("duration", Number(e.target.value))} style={{ width: 60 }} /></label>
          <label>dt (s): <input type="number" step="0.001" value={scene.dt} onChange={(e) => field("dt", Number(e.target.value))} style={{ width: 70 }} /></label>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {lastRun && last && series && (
        <>
          <section className="panel">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <h3 style={{ marginTop: 0 }}>Trayectoria (x, y)</h3>
                <TrajectoryPlot series={series} />
              </div>
              <div>
                <h3 style={{ marginTop: 0 }}>Energía vs. tiempo</h3>
                <EnergyChart series={series} />
              </div>
            </div>
          </section>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Estado final (t = {last.t.toFixed(2)} s, {lastRun.result.steps} pasos RK4)</h3>
            <RunConsole
              items={[
                { id: "speed", label: "Rapidez", value: last.speed, decimals: 4, unit: "m/s", status: "good" },
                ...(scene.mode === "pendulum"
                  ? [{ id: "theta", label: "Ángulo θ", value: last.theta_deg ?? 0, decimals: 3, unit: "°", status: "good" as const }]
                  : []),
                ...(scene.mode === "incline"
                  ? [{ id: "s", label: "Distancia recorrida", value: last.s ?? 0, decimals: 4, unit: "m", status: "good" as const }]
                  : []),
                { id: "ke", label: "Energía cinética", value: last.kinetic_energy, decimals: 3, unit: "J", status: "good" },
                { id: "pe", label: "Energía potencial", value: last.potential_energy, decimals: 3, unit: "J", status: "good" },
                { id: "te", label: "Energía total", value: last.total_energy, decimals: 3, unit: "J", status: "good" },
              ]}
            />
            <p className="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 10 }}>
              Posición: x={last.x.toFixed(4)} m, y={last.y.toFixed(4)} m
              {scene.mode === "pendulum" && <> · ω={last.omega_deg_s?.toFixed(3)}°/s</>}
              {scene.mode === "incline" && <> · v={last.v?.toFixed(4)} m/s</>}
            </p>
          </section>
        </>
      )}

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}
