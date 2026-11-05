"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import { TitrationResult, TitrationScene } from "./types";
import TitrationChart from "./TitrationChart";
import TitrationBench from "./TitrationBench";

const STORAGE_KEY = "usl-chemistry-project-id";
const DISCIPLINE = "chemistry";

const DEFAULT_SCENE: TitrationScene = {
  analyte_type: "acid",
  analyte_conc: 0.1,
  analyte_volume: 0.05,
  titrant_conc: 0.1,
  max_titrant_volume: 0.1,
  steps: 60,
  ka: null,
  kb: null,
};

const WEAK_PAIRS: Record<string, { ka?: number; kb?: number; label: string }> = {
  "Fuerte (sin Ka/Kb)": { label: "" },
  "Ácido acético (Ka=1.8×10⁻⁵)": { ka: 1.8e-5, label: "" },
  "Ácido fórmico (Ka=1.8×10⁻⁴)": { ka: 1.8e-4, label: "" },
  "Amoníaco (Kb=1.8×10⁻⁵)": { kb: 1.8e-5, label: "" },
};

export default function ChemistryPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<TitrationScene>(DEFAULT_SCENE);
  const [lastRun, setLastRun] = useState<Run<TitrationResult> | null>(null);
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
          if (p.scene && Object.keys(p.scene).length) setScene({ ...DEFAULT_SCENE, ...(p.scene as unknown as TitrationScene) });
          const typedRuns = p.runs as unknown as Run<TitrationResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const { connected, connectedCount } = useCollaboration<TitrationScene, TitrationResult>({
    projectId: project?.id ?? null,
    onSceneUpdated: (s) => { if (s && Object.keys(s).length) setScene({ ...DEFAULT_SCENE, ...s }); },
    onRunAdded: (run) => setLastRun(run),
  });

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Titulación ácido-base", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function field(key: keyof TitrationScene, value: number | string | null) {
    setScene((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAndRun(overrideScene?: TitrationScene) {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProject();
      const toSave = overrideScene ?? sceneRef.current;
      await api.saveScene(p.id, toSave as unknown as Record<string, unknown>);
      const run = await api.runProject<TitrationResult>(p.id);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
    }
  }

  const titrantLabel = scene.analyte_type === "acid" ? "base fuerte" : "ácido fuerte";
  const equivalencePoint = lastRun?.result.series.find(
    (p) => Math.abs(p.titrant_volume - lastRun.result.equivalence_volume) < 1e-9
  );
  const lastSeries = lastRun?.result.series;
  const phAtVolume = lastSeries && lastSeries.length ? lastSeries[lastSeries.length - 1].ph : null;
  const isWeak = scene.ka != null || scene.kb != null;

  return (
    <main className="lab-chemistry">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <h1>Laboratorio de Química <PresenceBadge connected={connected} count={connectedCount} /></h1>
      <p className="subtitle">
        Arrastrá la bureta para volcar titulante — ácido/base fuerte por balance de moles exacto, o ácido/base
        <strong> débil</strong> por balance de carga resuelto numéricamente (Ka/Kb), adaptador{" "}
        <span className="badge">chemistry-titration-strong v0.2.0</span> · nivel de fidelidad 3/5. Kw=1.0×10⁻¹⁴ a 25°C.
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Mesa de titulación</h3>
        <TitrationBench
          volumeL={scene.max_titrant_volume}
          rangeMaxL={Math.max(0.1, scene.max_titrant_volume * 1.2)}
          phAtVolume={phAtVolume}
          onVolumeChange={(v) => field("max_titrant_volume", v)}
          onDragEnd={() => saveAndRun()}
        />

        <h3>Analito</h3>
        <div className="row">
          <label>Tipo:
            <select value={scene.analyte_type} onChange={(e) => field("analyte_type", e.target.value)} style={{ marginLeft: 6 }}>
              <option value="acid">Ácido</option>
              <option value="base">Base</option>
            </select>
          </label>
          <label>Concentración (mol/L): <input type="number" step="0.01" value={scene.analyte_conc} onChange={(e) => field("analyte_conc", Number(e.target.value))} style={{ width: 70 }} /></label>
          <label>Volumen (L): <input type="number" step="0.001" value={scene.analyte_volume} onChange={(e) => field("analyte_volume", Number(e.target.value))} style={{ width: 70 }} /></label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {Object.entries(WEAK_PAIRS).map(([name, v]) => (
            <button key={name} className="secondary" onClick={() => {
              if (v.ka) field("analyte_type", "acid");
              if (v.kb) field("analyte_type", "base");
              setScene((prev) => ({ ...prev, ka: v.ka ?? null, kb: v.kb ?? null, analyte_type: v.ka ? "acid" : v.kb ? "base" : prev.analyte_type }));
            }}>{name}</button>
          ))}
        </div>
        {isWeak && (
          <p className="subtitle" style={{ marginTop: 4 }}>
            {scene.ka != null && <>Ka = {scene.ka.toExponential(2)} (pKa = {(-Math.log10(scene.ka)).toFixed(2)})</>}
            {scene.kb != null && <>Kb = {scene.kb.toExponential(2)} (pKb = {(-Math.log10(scene.kb)).toFixed(2)})</>}
            {" "}— equilibrio real resuelto numéricamente, no aproximado con Henderson-Hasselbalch.
          </p>
        )}

        <h3>Titulante ({titrantLabel})</h3>
        <div className="row">
          <label>Concentración (mol/L): <input type="number" step="0.01" value={scene.titrant_conc} onChange={(e) => field("titrant_conc", Number(e.target.value))} style={{ width: 70 }} /></label>
          <label>Volumen máximo a agregar (L): <input type="number" step="0.001" value={scene.max_titrant_volume} onChange={(e) => field("max_titrant_volume", Number(e.target.value))} style={{ width: 70 }} /></label>
          <label>Pasos: <input type="number" value={scene.steps} onChange={(e) => field("steps", Number(e.target.value))} style={{ width: 55 }} /></label>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => saveAndRun()} disabled={busy}>{busy ? "Calculando…" : "Guardar y ejecutar"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {lastRun && (
        <>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Curva de titulación</h3>
            <TitrationChart series={lastRun.result.series} equivalenceVolume={lastRun.result.equivalence_volume} />
          </section>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Punto de equivalencia</h3>
            <p>
              Volumen de titulante: <strong>{(lastRun.result.equivalence_volume * 1000).toFixed(3)} mL</strong>
              {lastRun.result.equivalence_in_range ? "" : " (fuera del rango simulado)"}
              {equivalencePoint && (
                <> · pH calculado en ese punto: <strong>{equivalencePoint.ph.toFixed(2)}</strong>{" "}
                  {isWeak
                    ? "(no es 7.00: hidrólisis del par conjugado débil — esto es correcto, no un error)"
                    : "(debe ser exactamente 7.00 para ácido-base fuerte)"}
                </>
              )}
            </p>
          </section>
        </>
      )}

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}
