"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { CircuitComponent, CircuitResult } from "./types";
import CircuitDiagram from "./CircuitDiagram";

const STORAGE_KEY = "usl-electronics-project-id";
const DISCIPLINE = "electronics";

const SAMPLE_COMPONENTS: CircuitComponent[] = [
  { id: "v1", type: "dc_source", node_a: "n1", node_b: "gnd", value: 10 },
  { id: "r1", type: "resistor", node_a: "n1", node_b: "n2", value: 100 },
  { id: "r2", type: "resistor", node_a: "n2", node_b: "gnd", value: 100 },
];

export default function ElectronicsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [components, setComponents] = useState<CircuitComponent[]>(SAMPLE_COMPONENTS);
  const [lastRun, setLastRun] = useState<Run<CircuitResult> | null>(null);
  const [runs, setRuns] = useState<Run<CircuitResult>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      api
        .getProject<{ components: CircuitComponent[] }>(existing)
        .then((p) => {
          setProject(p);
          if (p.scene.components?.length) setComponents(p.scene.components);
          const typedRuns = p.runs as unknown as Run<CircuitResult>[];
          setRuns(typedRuns);
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Circuito de electrónica", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function updateComponent(index: number, patch: Partial<CircuitComponent>) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addComponent() {
    const id = `c${components.length + 1}`;
    setComponents((prev) => [...prev, { id, type: "resistor", node_a: "n1", node_b: "gnd", value: 100 }]);
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveAndRun() {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProject();
      await api.saveScene(p.id, { components });
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

  return (
    <main>
      <p><Link href="/">← Volver al catálogo</Link></p>
      <h1>Laboratorio de Electrónica</h1>
      <p className="subtitle">
        Análisis nodal DC real (NumPy), adaptador <span className="badge">electronics-dc v0.1.0</span>{" "}
        · nivel de fidelidad 3/5. No es una animación: cambia un valor y vuelve a ejecutar para comprobarlo.
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Componentes</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Tipo</th><th>Nodo A</th><th>Nodo B</th><th>Valor</th><th></th>
            </tr>
          </thead>
          <tbody>
            {components.map((c, i) => (
              <tr key={i}>
                <td><input value={c.id} onChange={(e) => updateComponent(i, { id: e.target.value })} style={{ width: 50 }} /></td>
                <td>
                  <select value={c.type} onChange={(e) => updateComponent(i, { type: e.target.value as CircuitComponent["type"] })}>
                    <option value="resistor">Resistencia</option>
                    <option value="dc_source">Fuente DC</option>
                  </select>
                </td>
                <td><input value={c.node_a} onChange={(e) => updateComponent(i, { node_a: e.target.value })} style={{ width: 50 }} /></td>
                <td><input value={c.node_b} onChange={(e) => updateComponent(i, { node_b: e.target.value })} style={{ width: 50 }} /></td>
                <td>
                  <input
                    type="number"
                    value={c.value}
                    onChange={(e) => updateComponent(i, { value: Number(e.target.value) })}
                    style={{ width: 70 }}
                  />
                  <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 4 }}>
                    {c.type === "resistor" ? "Ω" : "V"}
                  </span>
                </td>
                <td><button className="secondary" onClick={() => removeComponent(i)}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary" onClick={addComponent}>+ Componente</button>
          <button onClick={saveAndRun} disabled={busy}>{busy ? "Ejecutando…" : "Guardar y ejecutar"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Diagrama</h3>
        <CircuitDiagram components={components} nodeVoltages={lastRun?.result.node_voltages} />
      </section>

      {lastRun && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Resultados (última corrida)</h3>
          <table>
            <thead><tr><th>Componente</th><th>Tipo</th><th>Voltaje</th><th>Corriente</th><th>Potencia</th></tr></thead>
            <tbody>
              {lastRun.result.components.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.type}</td>
                  <td>{r.voltage.toFixed(3)} V</td>
                  <td>{(r.current * 1000).toFixed(2)} mA</td>
                  <td>{(r.power * 1000).toFixed(2)} mW</td>
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
                  <td>{(r.scene as unknown as { components: CircuitComponent[] }).components.map((c) => `${c.id}=${c.value}`).join(", ")}</td>
                  <td>{Object.entries(r.result.node_voltages).map(([n, v]) => `${n}=${v.toFixed(2)}V`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
