"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import { DailyWeather, GrowthResult, Thresholds } from "./types";
import GrowthChart from "./GrowthChart";

const STORAGE_KEY = "usl-agriculture-project-id";
const DISCIPLINE = "agriculture";

function makeDays(n: number, tmin: number, tmax: number): DailyWeather[] {
  return Array.from({ length: n }, (_, i) => ({ day: i + 1, tmin, tmax }));
}

export default function AgriculturePage() {
  const [project, setProject] = useState<Project | null>(null);
  const [tBase, setTBase] = useState(10);
  const [thresholds, setThresholds] = useState<Thresholds>({ germination: 50, flowering: 600, maturity: 1200 });
  const [days, setDays] = useState<DailyWeather[]>(makeDays(60, 15, 27));
  const [genCount, setGenCount] = useState(60);
  const [genTmin, setGenTmin] = useState(15);
  const [genTmax, setGenTmax] = useState(27);
  const [lastRun, setLastRun] = useState<Run<GrowthResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      api
        .getProject(existing)
        .then((p) => {
          setProject(p);
          const scene = p.scene as unknown as { t_base: number; days: DailyWeather[]; thresholds: Thresholds };
          if (scene.t_base) setTBase(scene.t_base);
          if (scene.days?.length) setDays(scene.days);
          if (scene.thresholds) setThresholds(scene.thresholds);
          const typedRuns = p.runs as unknown as Run<GrowthResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const { connected, connectedCount } = useCollaboration<
    { t_base: number; days: DailyWeather[]; thresholds: Thresholds },
    GrowthResult
  >({
    projectId: project?.id ?? null,
    onSceneUpdated: (scene) => {
      if (scene.t_base) setTBase(scene.t_base);
      if (scene.days?.length) setDays(scene.days);
      if (scene.thresholds) setThresholds(scene.thresholds);
    },
    onRunAdded: (run) => setLastRun(run),
  });

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Ciclo de cultivo (GDD)", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  async function saveAndRun() {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProject();
      const scene = { t_base: tBase, days, thresholds };
      await api.saveScene(p.id, scene);
      const run = await api.runProject<GrowthResult>(p.id);
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
      <h1>Laboratorio de Naturaleza y Agricultura <PresenceBadge connected={connected} count={connectedCount} /></h1>
      <p className="subtitle">
        Modelo real de grados-día de crecimiento (GDD), adaptador{" "}
        <span className="badge">agriculture-gdd v0.1.0</span> · nivel de fidelidad 2/5.
      </p>
      <p className="subtitle" style={{ color: "var(--bad)" }}>
        Importante: la temperatura base y los umbrales de etapa son parámetros que vos ingresás, no datos
        verificados por especie — docs/00-discovery.md prohíbe inventar esos valores. Si vas a usar esto para
        una especie real, verificá los umbrales con una fuente agronómica (INTA, extensión universitaria, etc.)
        antes de confiar en el resultado.
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Parámetros del modelo</h3>
        <div className="row">
          <label>Temperatura base (°C):
            <input type="number" value={tBase} onChange={(e) => setTBase(Number(e.target.value))} style={{ width: 60, marginLeft: 6 }} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label>GDD germinación:
            <input type="number" value={thresholds.germination} onChange={(e) => setThresholds({ ...thresholds, germination: Number(e.target.value) })} style={{ width: 70, marginLeft: 6 }} />
          </label>
          <label>GDD floración:
            <input type="number" value={thresholds.flowering} onChange={(e) => setThresholds({ ...thresholds, flowering: Number(e.target.value) })} style={{ width: 70, marginLeft: 6 }} />
          </label>
          <label>GDD madurez:
            <input type="number" value={thresholds.maturity} onChange={(e) => setThresholds({ ...thresholds, maturity: Number(e.target.value) })} style={{ width: 70, marginLeft: 6 }} />
          </label>
        </div>

        <h3>Clima diario ({days.length} días)</h3>
        <div className="row">
          <label>Generar: <input type="number" value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} style={{ width: 55, marginLeft: 4 }} /></label>
          <label>días con tmin <input type="number" value={genTmin} onChange={(e) => setGenTmin(Number(e.target.value))} style={{ width: 50, marginLeft: 4 }} /></label>
          <label>y tmax <input type="number" value={genTmax} onChange={(e) => setGenTmax(Number(e.target.value))} style={{ width: 50, marginLeft: 4 }} /></label>
          <button className="secondary" onClick={() => setDays(makeDays(genCount, genTmin, genTmax))}>Generar serie</button>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={saveAndRun} disabled={busy}>{busy ? "Ejecutando…" : "Guardar y ejecutar"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {lastRun && (
        <>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Acumulación de GDD</h3>
            <GrowthChart series={lastRun.result.series} thresholds={thresholds} />
          </section>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Resultado</h3>
            <p>Estado actual: <strong>{lastRun.result.current_stage}</strong> · GDD total acumulado: {lastRun.result.total_gdd.toFixed(1)}</p>
            <table>
              <thead><tr><th>Etapa</th><th>Día en que se alcanzó</th></tr></thead>
              <tbody>
                <tr><td>Germinación</td><td>{lastRun.result.stage_reached_on_day.germination ?? "no alcanzada"}</td></tr>
                <tr><td>Floración</td><td>{lastRun.result.stage_reached_on_day.flowering ?? "no alcanzada"}</td></tr>
                <tr><td>Madurez</td><td>{lastRun.result.stage_reached_on_day.maturity ?? "no alcanzada"}</td></tr>
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
