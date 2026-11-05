"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Run } from "../lib/api";
import { Device, Link as TopologyLink, TopologyResult } from "./types";
import TopologyDiagram from "./TopologyDiagram";

const STORAGE_KEY = "usl-networking-project-id";
const DISCIPLINE = "networking";

const SAMPLE_DEVICES: Device[] = [
  { id: "pc1", type: "pc", ip: "192.168.1.10", prefix: 24 },
  { id: "pc2", type: "pc", ip: "192.168.1.20", prefix: 24 },
  { id: "pc3", type: "pc", ip: "192.168.2.10", prefix: 24 },
  { id: "sw1", type: "switch" },
  { id: "router1", type: "router", ip: "192.168.1.1", prefix: 24 },
  { id: "sw2", type: "switch" },
];
const SAMPLE_LINKS: TopologyLink[] = [
  { a: "pc1", b: "sw1" },
  { a: "pc2", b: "sw1" },
  { a: "sw1", b: "router1" },
  { a: "router1", b: "sw2" },
  { a: "sw2", b: "pc3" },
];

export default function NetworkingPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [devices, setDevices] = useState<Device[]>(SAMPLE_DEVICES);
  const [links, setLinks] = useState<TopologyLink[]>(SAMPLE_LINKS);
  const [lastRun, setLastRun] = useState<Run<TopologyResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      api
        .getProject<{ devices: Device[]; links: TopologyLink[] }>(existing)
        .then((p) => {
          setProject(p);
          if (p.scene.devices?.length) setDevices(p.scene.devices);
          if (p.scene.links?.length) setLinks(p.scene.links);
          const typedRuns = p.runs as unknown as Run<TopologyResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Topología de red", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function updateDevice(i: number, patch: Partial<Device>) {
    setDevices((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function addDevice() {
    setDevices((prev) => [...prev, { id: `d${prev.length + 1}`, type: "pc", ip: "10.0.0.2", prefix: 24 }]);
  }
  function removeDevice(i: number) {
    setDevices((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateLink(i: number, patch: Partial<TopologyLink>) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLink() {
    if (devices.length < 2) return;
    setLinks((prev) => [...prev, { a: devices[0].id, b: devices[1].id }]);
  }
  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveAndRun() {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProject();
      await api.saveScene(p.id, { devices, links });
      const run = await api.runProject<TopologyResult>(p.id);
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
      <h1>Laboratorio de Redes</h1>
      <p className="subtitle">
        Subnetting IPv4 real (módulo <code>ipaddress</code> de Python) + alcanzabilidad por grafo, adaptador{" "}
        <span className="badge">networking-topology v0.1.0</span> · nivel de fidelidad 2/5. Es un simulador
        conceptual de direccionamiento y topología, no una emulación de un sistema operativo de red real.
      </p>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Dispositivos</h3>
        <table>
          <thead><tr><th>ID</th><th>Tipo</th><th>IP</th><th>Prefijo</th><th></th></tr></thead>
          <tbody>
            {devices.map((d, i) => (
              <tr key={i}>
                <td><input value={d.id} onChange={(e) => updateDevice(i, { id: e.target.value })} style={{ width: 60 }} /></td>
                <td>
                  <select value={d.type} onChange={(e) => updateDevice(i, { type: e.target.value as Device["type"] })}>
                    <option value="pc">PC</option>
                    <option value="router">Router</option>
                    <option value="switch">Switch</option>
                  </select>
                </td>
                <td>
                  {d.type !== "switch" && (
                    <input value={d.ip ?? ""} onChange={(e) => updateDevice(i, { ip: e.target.value })} style={{ width: 110 }} placeholder="192.168.1.10" />
                  )}
                </td>
                <td>
                  {d.type !== "switch" && (
                    <input type="number" value={d.prefix ?? 24} onChange={(e) => updateDevice(i, { prefix: Number(e.target.value) })} style={{ width: 50 }} />
                  )}
                </td>
                <td><button className="secondary" onClick={() => removeDevice(i)}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary" onClick={addDevice}>+ Dispositivo</button>
        </div>

        <h3>Enlaces</h3>
        <table>
          <thead><tr><th>Extremo A</th><th>Extremo B</th><th></th></tr></thead>
          <tbody>
            {links.map((l, i) => (
              <tr key={i}>
                <td>
                  <select value={l.a} onChange={(e) => updateLink(i, { a: e.target.value })}>
                    {devices.map((d) => <option key={d.id} value={d.id}>{d.id}</option>)}
                  </select>
                </td>
                <td>
                  <select value={l.b} onChange={(e) => updateLink(i, { b: e.target.value })}>
                    {devices.map((d) => <option key={d.id} value={d.id}>{d.id}</option>)}
                  </select>
                </td>
                <td><button className="secondary" onClick={() => removeLink(i)}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary" onClick={addLink}>+ Enlace</button>
          <button onClick={saveAndRun} disabled={busy}>{busy ? "Ejecutando…" : "Guardar y ejecutar"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Diagrama</h3>
        <TopologyDiagram devices={devices} links={links} />
      </section>

      {lastRun && (
        <>
          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Información de subred por dispositivo</h3>
            <table>
              <thead><tr><th>Dispositivo</th><th>Red</th><th>Máscara</th><th>Broadcast</th><th>Hosts usables</th></tr></thead>
              <tbody>
                {Object.entries(lastRun.result.subnets).filter(([, s]) => s).map(([id, s]) => (
                  <tr key={id}>
                    <td>{id}</td>
                    <td>{s!.network}/{s!.prefix}</td>
                    <td>{s!.netmask}</td>
                    <td>{s!.broadcast}</td>
                    <td>{s!.usable_hosts} ({s!.first_host}–{s!.last_host})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Alcanzabilidad</h3>
            <table>
              <thead><tr><th>Par</th><th>Enlace físico</th><th>Misma subred</th><th>Alcanzable (L3)</th><th>Saltos</th><th>Motivo</th></tr></thead>
              <tbody>
                {lastRun.result.reachability.map((r, i) => (
                  <tr key={i}>
                    <td>{r.a} ↔ {r.b}</td>
                    <td>{r.physically_connected ? "sí" : "no"}</td>
                    <td>{r.same_subnet ? "sí" : "no"}</td>
                    <td style={{ color: r.l3_reachable ? "var(--good)" : "var(--bad)" }}>{r.l3_reachable ? "sí" : "no"}</td>
                    <td>{r.hops ?? "—"}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
