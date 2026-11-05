"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import InteractiveCanvas, { Piece } from "../lib/InteractiveCanvas";
import { GrowthResult, GrowthScene, Plot } from "./types";
import { PIECE_TYPES, SPECIES_REFERENCE, defaultPlot, makeDays, nextPlotId } from "./canvasAdapter";
import GrowthChart from "./GrowthChart";

const STORAGE_KEY = "usl-agriculture-project-id";
const DISCIPLINE = "agriculture";

const SAMPLE_LAYOUT: Record<string, { x: number; y: number }> = { parcela1: { x: 120, y: 100 } };

export default function AgriculturePage() {
  const [project, setProject] = useState<Project | null>(null);
  const [plots, setPlots] = useState<Plot[]>([{ ...defaultPlot("parcela1") }]);
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }>>(SAMPLE_LAYOUT);
  const [selectedId, setSelectedId] = useState<string | null>("parcela1");
  const [lastRun, setLastRun] = useState<Run<GrowthResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loadScene(scene: GrowthScene) {
    if (scene.plots?.length) setPlots(scene.plots);
    if (scene.layout && Object.keys(scene.layout).length) {
      setLayout(scene.layout);
    } else if (scene.plots?.length) {
      const grid: Record<string, { x: number; y: number }> = {};
      scene.plots.forEach((p, i) => { grid[p.label] = { x: 100 + (i % 4) * 140, y: 100 + Math.floor(i / 4) * 110 }; });
      setLayout(grid);
    }
  }

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      api
        .getProject(existing)
        .then((p) => {
          setProject(p);
          loadScene(p.scene as unknown as GrowthScene);
          const typedRuns = p.runs as unknown as Run<GrowthResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const { connected, connectedCount } = useCollaboration<GrowthScene, GrowthResult>({
    projectId: project?.id ?? null,
    onSceneUpdated: (scene) => loadScene(scene),
    onRunAdded: (run) => setLastRun(run),
  });

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Ciclo de cultivo (GDD)", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function placePlot(_type: string, x: number, y: number) {
    const id = nextPlotId();
    setPlots((prev) => [...prev, { ...defaultPlot(id) }]);
    setLayout((prev) => ({ ...prev, [id]: { x, y } }));
    setSelectedId(id);
  }
  function movePlot(uid: string, x: number, y: number) {
    setLayout((prev) => ({ ...prev, [uid]: { x, y } }));
  }
  function deletePlot(uid: string) {
    setPlots((prev) => prev.filter((p) => p.label !== uid));
    setSelectedId((s) => (s === uid ? null : s));
  }
  function updateSelected(patch: Partial<Plot>) {
    setPlots((prev) => prev.map((p) => (p.label === selectedId ? { ...p, ...patch } : p)));
  }

  async function saveAndRun() {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProject();
      const scene: GrowthScene = { plots, layout };
      await api.saveScene(p.id, scene as unknown as Record<string, unknown>);
      const run = await api.runProject<GrowthResult>(p.id);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
    }
  }

  const selected = plots.find((p) => p.label === selectedId);
  const selectedResult = lastRun?.result.plots.find((p) => p.label === selectedId);

  const pieces: Piece[] = plots.map((p) => {
    const r = lastRun?.result.plots.find((pr) => pr.label === p.label);
    return {
      uid: p.label, type: "plot", x: layout[p.label]?.x ?? 100, y: layout[p.label]?.y ?? 100,
      state: p.label === selectedId ? "selected" : "default",
      badge: r ? `${r.current_stage} · ${r.total_gdd.toFixed(0)} GDD` : undefined,
    };
  });

  return (
    <main className="lab-agriculture">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <h1>Laboratorio de Naturaleza y Agricultura <PresenceBadge connected={connected} count={connectedCount} /></h1>
      <p className="subtitle">
        Arrastrá parcelas al campo y simulá cada una por separado con el modelo real de grados-día de
        crecimiento (GDD), adaptador <span className="badge">agriculture-gdd v0.2.0</span> · nivel de
        fidelidad 2/5.
      </p>
      <p className="subtitle" style={{ color: "var(--bad)" }}>
        Importante: la temperatura base y los umbrales de etapa son parámetros que vos ingresás (o presets de
        referencia sin verificar), no datos confirmados por especie. Si vas a usar esto para una especie real,
        verificá los umbrales con una fuente agronómica (INTA, extensión universitaria, etc.) antes de confiar
        en el resultado.
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Campo ({plots.length} parcela{plots.length !== 1 ? "s" : ""})</h3>
        <InteractiveCanvas
          pieceTypes={PIECE_TYPES}
          pieces={pieces}
          links={[]}
          allowLinks={false}
          selectedUid={selectedId}
          onPlace={placePlot}
          onMove={movePlot}
          onSelect={setSelectedId}
          onDelete={deletePlot}
          onLink={() => {}}
        />

        {selected && (
          <div className="props-panel" style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <div className="row">
              <strong>{selected.label}</strong>
              <label>Temp. base (°C): <input type="number" value={selected.t_base} onChange={(e) => updateSelected({ t_base: Number(e.target.value) })} style={{ width: 60 }} /></label>
            </div>
            <div className="row">
              {Object.keys(SPECIES_REFERENCE).map((name) => (
                <button key={name} className="secondary" onClick={() => {
                  const ref = SPECIES_REFERENCE[name];
                  updateSelected({ t_base: ref.t_base, thresholds: { germination: ref.germination, flowering: ref.flowering, maturity: ref.maturity } });
                }}>{name}</button>
              ))}
            </div>
            <div className="row">
              <label>GDD germinación: <input type="number" value={selected.thresholds.germination} onChange={(e) => updateSelected({ thresholds: { ...selected.thresholds, germination: Number(e.target.value) } })} style={{ width: 70 }} /></label>
              <label>GDD floración: <input type="number" value={selected.thresholds.flowering} onChange={(e) => updateSelected({ thresholds: { ...selected.thresholds, flowering: Number(e.target.value) } })} style={{ width: 70 }} /></label>
              <label>GDD madurez: <input type="number" value={selected.thresholds.maturity} onChange={(e) => updateSelected({ thresholds: { ...selected.thresholds, maturity: Number(e.target.value) } })} style={{ width: 70 }} /></label>
            </div>
            <div className="row">
              <label>Generar {selected.days.length} días con tmin
                <input type="number" defaultValue={15} id={`tmin-${selected.label}`} style={{ width: 50, marginLeft: 4 }} />
              </label>
              <label>y tmax
                <input type="number" defaultValue={27} id={`tmax-${selected.label}`} style={{ width: 50, marginLeft: 4 }} />
              </label>
              <label>días
                <input type="number" defaultValue={selected.days.length} id={`n-${selected.label}`} style={{ width: 55, marginLeft: 4 }} />
              </label>
              <button className="secondary" onClick={() => {
                const n = Number((document.getElementById(`n-${selected.label}`) as HTMLInputElement).value);
                const tmin = Number((document.getElementById(`tmin-${selected.label}`) as HTMLInputElement).value);
                const tmax = Number((document.getElementById(`tmax-${selected.label}`) as HTMLInputElement).value);
                updateSelected({ days: makeDays(n, tmin, tmax) });
              }}>Generar serie de clima</button>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={saveAndRun} disabled={busy}>{busy ? "Ejecutando…" : "Guardar y ejecutar"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {selected && selectedResult && (
        <>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Acumulación de GDD — {selected.label}</h3>
            <GrowthChart series={selectedResult.series} thresholds={selected.thresholds} />
          </section>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Resultado — {selected.label}</h3>
            <p>Estado actual: <strong>{selectedResult.current_stage}</strong> · GDD total acumulado: {selectedResult.total_gdd.toFixed(1)}</p>
            <table>
              <thead><tr><th>Etapa</th><th>Día en que se alcanzó</th></tr></thead>
              <tbody>
                <tr><td>Germinación</td><td>{selectedResult.stage_reached_on_day.germination ?? "no alcanzada"}</td></tr>
                <tr><td>Floración</td><td>{selectedResult.stage_reached_on_day.flowering ?? "no alcanzada"}</td></tr>
                <tr><td>Madurez</td><td>{selectedResult.stage_reached_on_day.maturity ?? "no alcanzada"}</td></tr>
              </tbody>
            </table>
          </section>
        </>
      )}

      {lastRun && lastRun.result.plots.length > 1 && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Comparación de parcelas</h3>
          <table>
            <thead><tr><th>Parcela</th><th>Estado</th><th>GDD total</th></tr></thead>
            <tbody>
              {lastRun.result.plots.map((p) => (
                <tr key={p.label}><td>{p.label}</td><td>{p.current_stage}</td><td>{p.total_gdd.toFixed(1)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}
