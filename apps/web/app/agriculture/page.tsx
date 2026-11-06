"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import ThemeToggle from "../lib/ThemeToggle";
import InteractiveCanvas, { Piece } from "../lib/InteractiveCanvas";
import RunConsole, { ReadoutItem } from "../lib/RunConsole";
import OscilloscopeTrace from "../lib/OscilloscopeTrace";
import { GrowthResult, GrowthScene, Plot, PlotResult } from "./types";
import { PIECE_TYPES, SPECIES_REFERENCE, defaultPlot, makeDays, nextPlotId } from "./canvasAdapter";

const STORAGE_KEY = "usl-agriculture-project-id";
const DISCIPLINE = "agriculture";
const MIN_ENERGIZE_MS = 900;

const SAMPLE_LAYOUT: Record<string, { x: number; y: number }> = { parcela1: { x: 120, y: 100 } };

export default function AgriculturePage() {
  const [project, setProject] = useState<Project | null>(null);
  const [plots, setPlots] = useState<Plot[]>([{ ...defaultPlot("parcela1") }]);
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }>>(SAMPLE_LAYOUT);
  const [selectedId, setSelectedId] = useState<string | null>("parcela1");
  const [lastRun, setLastRun] = useState<Run<GrowthResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [energizing, setEnergizing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

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
    setEnergizing(true);
    try {
      const p = await ensureProject();
      const scene: GrowthScene = { plots, layout };
      await api.saveScene(p.id, scene as unknown as Record<string, unknown>);
      const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_ENERGIZE_MS));
      const [run] = await Promise.all([api.runProject<GrowthResult>(p.id), minDelay]);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
      setEnergizing(false);
    }
  }

  // Projects saved before multi-plot shipped have a run whose result is the
  // old flat shape ({series, total_gdd, ...} at the top level, no `plots`
  // array) — the backend keeps returning that shape unchanged for any
  // already-stored row, since it's historical data, not recomputed. Treat
  // it as a single implicit plot instead of crashing on `.plots.find`.
  const legacyResult = lastRun?.result as unknown as (Omit<PlotResult, "label"> & { plots?: undefined }) | undefined;
  const resultPlots: PlotResult[] = lastRun
    ? lastRun.result.plots ?? (legacyResult ? [{ label: plots[0]?.label ?? "parcela1", ...legacyResult }] : [])
    : [];

  const selected = plots.find((p) => p.label === selectedId);
  const selectedResult = resultPlots.find((p) => p.label === selectedId) ?? resultPlots[0];

  const pieces: Piece[] = plots.map((p) => {
    const r = resultPlots.find((pr) => pr.label === p.label);
    return {
      uid: p.label, type: "plot", x: layout[p.label]?.x ?? 100, y: layout[p.label]?.y ?? 100,
      state: p.label === selectedId ? "selected" : "default",
      badge: r ? `${r.current_stage} · ${r.total_gdd.toFixed(0)} GDD` : undefined,
      stage: r?.current_stage,
    } as Piece;
  });

  const stageItems: ReadoutItem[] = selectedResult
    ? [
        { id: "germination", label: "Germinación", value: selectedResult.stage_reached_on_day.germination ?? 0, decimals: 0, unit: "día", status: selectedResult.stage_reached_on_day.germination != null ? "good" : "neutral", noReading: selectedResult.stage_reached_on_day.germination == null },
        { id: "flowering", label: "Floración", value: selectedResult.stage_reached_on_day.flowering ?? 0, decimals: 0, unit: "día", status: selectedResult.stage_reached_on_day.flowering != null ? "good" : "neutral", noReading: selectedResult.stage_reached_on_day.flowering == null },
        { id: "maturity", label: "Madurez", value: selectedResult.stage_reached_on_day.maturity ?? 0, decimals: 0, unit: "día", status: selectedResult.stage_reached_on_day.maturity != null ? "good" : "neutral", noReading: selectedResult.stage_reached_on_day.maturity == null },
      ]
    : [];

  const plotCompareItems: ReadoutItem[] = resultPlots.map((p) => ({
    id: p.label,
    label: p.label,
    value: p.total_gdd,
    decimals: 1,
    unit: "GDD",
    status: "good",
    statusLabel: p.current_stage,
  }));

  return (
    <main className="lab-agriculture">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <div className="lab-topbar">
        <h1>Laboratorio de Naturaleza y Agricultura <PresenceBadge connected={connected} count={connectedCount} /></h1>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => setInfoOpen((v) => !v)} title="Sobre este laboratorio">
            <Info size={16} />
          </button>
          <ThemeToggle />
        </div>
      </div>
      {infoOpen && (
        <p className="subtitle info-popover">
          Arrastrá parcelas al campo y simulá cada una por separado con el modelo real de grados-día de
          crecimiento (GDD), adaptador <span className="badge">agriculture-gdd v0.2.0</span> · nivel de
          fidelidad 2/5. Importante: la temperatura base y los umbrales de etapa son parámetros que vos
          ingresás (o presets de referencia sin verificar), no datos confirmados por especie. Si vas a usar
          esto para una especie real, verificá los umbrales con una fuente agronómica (INTA, extensión
          universitaria, etc.) antes de confiar en el resultado.
        </p>
      )}

      <section className="lab-console">
        <InteractiveCanvas
          pieceTypes={PIECE_TYPES}
          pieces={pieces}
          links={[]}
          allowLinks={false}
          selectedUid={selectedId}
          gridStyle="field"
          paletteDocked
          energizing={energizing}
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
          <button onClick={saveAndRun} disabled={busy}>
            {energizing ? "Energizando…" : busy ? "Ejecutando…" : "Guardar y ejecutar"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {selected && selectedResult && (
        <>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Acumulación de GDD — {selected.label}</h3>
            <OscilloscopeTrace
              points={selectedResult.series.map((s) => ({ x: s.day, y: s.gdd_accumulated }))}
              thresholds={[
                { label: "Germinación", value: selected.thresholds.germination, color: "#4ade80" },
                { label: "Floración", value: selected.thresholds.flowering, color: "#fbbf24" },
                { label: "Madurez", value: selected.thresholds.maturity, color: "#f87171" },
              ]}
              xStartLabel="día 1"
              xEndLabel={`día ${selectedResult.series[selectedResult.series.length - 1]?.day ?? ""}`}
            />
          </section>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Resultado — {selected.label}</h3>
            <p>Estado actual: <strong>{selectedResult.current_stage}</strong> · GDD total acumulado: {selectedResult.total_gdd.toFixed(1)}</p>
            <RunConsole items={stageItems} />
          </section>
        </>
      )}

      {resultPlots.length > 1 && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Comparación de parcelas</h3>
          <RunConsole items={plotCompareItems} />
        </section>
      )}

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}
