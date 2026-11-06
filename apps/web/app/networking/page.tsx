"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { api, Project, Run } from "../lib/api";
import { useCollaboration } from "../lib/useCollaboration";
import PresenceBadge from "../lib/PresenceBadge";
import TutorPanel from "../lib/TutorPanel";
import ThemeToggle from "../lib/ThemeToggle";
import InteractiveCanvas, { CanvasLink, Piece } from "../lib/InteractiveCanvas";
import RunConsole, { ReadoutItem } from "../lib/RunConsole";
import { Device, DeviceType, FirewallRule, LinkType, TopologyResult, TopologyScene } from "./types";
import { PIECE_TYPES, defaultDevice, nextDeviceId } from "./canvasAdapter";

const STORAGE_KEY = "usl-networking-project-id";
const DISCIPLINE = "networking";
const MIN_ENERGIZE_MS = 900;

const SAMPLE_DEVICES: Device[] = [
  { id: "pc1", type: "pc", ip: "192.168.1.10", prefix: 24, vlan_id: 1 },
  { id: "pc2", type: "pc", ip: "192.168.1.20", prefix: 24, vlan_id: 1 },
  { id: "pc3", type: "pc", ip: "192.168.2.10", prefix: 24, vlan_id: 1 },
  { id: "sw1", type: "switch" },
  { id: "router1", type: "router", ip: "192.168.1.1", prefix: 24, vlan_id: 1 },
  { id: "sw2", type: "switch" },
];
const SAMPLE_LINKS: TopologyScene["links"] = [
  { a: "pc1", b: "sw1", link_type: "copper" },
  { a: "pc2", b: "sw1", link_type: "copper" },
  { a: "sw1", b: "router1", link_type: "copper" },
  { a: "router1", b: "sw2", link_type: "fiber" },
  { a: "sw2", b: "pc3", link_type: "copper" },
];
const SAMPLE_LAYOUT: Record<string, { x: number; y: number }> = {
  pc1: { x: 80, y: 80 }, pc2: { x: 80, y: 180 }, sw1: { x: 220, y: 130 },
  router1: { x: 360, y: 130 }, sw2: { x: 500, y: 130 }, pc3: { x: 620, y: 130 },
};

export default function NetworkingPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [devices, setDevices] = useState<Device[]>(SAMPLE_DEVICES);
  const [links, setLinks] = useState<TopologyScene["links"]>(SAMPLE_LINKS);
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }>>(SAMPLE_LAYOUT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Run<TopologyResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [energizing, setEnergizing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  function loadScene(scene: TopologyScene) {
    if (scene.devices?.length) setDevices(scene.devices);
    if (scene.links?.length) setLinks(scene.links);
    if (scene.layout && Object.keys(scene.layout).length) {
      setLayout(scene.layout);
    } else if (scene.devices?.length) {
      const grid: Record<string, { x: number; y: number }> = {};
      scene.devices.forEach((d, i) => { grid[d.id] = { x: 80 + (i % 5) * 130, y: 80 + Math.floor(i / 5) * 110 }; });
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
          loadScene(p.scene as unknown as TopologyScene);
          const typedRuns = p.runs as unknown as Run<TopologyResult>[];
          if (typedRuns.length) setLastRun(typedRuns[typedRuns.length - 1]);
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const { connected, connectedCount } = useCollaboration<TopologyScene, TopologyResult>({
    projectId: project?.id ?? null,
    onSceneUpdated: (scene) => loadScene(scene),
    onRunAdded: (run) => setLastRun(run),
  });

  async function ensureProject(): Promise<Project> {
    if (project) return project;
    const p = await api.createProject("Topología de red", DISCIPLINE);
    localStorage.setItem(STORAGE_KEY, p.id);
    setProject(p);
    return p;
  }

  function placeDevice(type: string, x: number, y: number) {
    const id = nextDeviceId(type as DeviceType);
    setDevices((prev) => [...prev, defaultDevice(type as DeviceType, id)]);
    setLayout((prev) => ({ ...prev, [id]: { x, y } }));
    setSelectedId(id);
  }
  function moveDevice(uid: string, x: number, y: number) {
    setLayout((prev) => ({ ...prev, [uid]: { x, y } }));
  }
  function deleteDevice(uid: string) {
    setDevices((prev) => prev.filter((d) => d.id !== uid));
    setLinks((prev) => prev.filter((l) => l.a !== uid && l.b !== uid));
    setSelectedId((s) => (s === uid ? null : s));
  }
  function linkDevices(fromUid: string, _fromT: string, toUid: string, _toT: string) {
    if (fromUid === toUid) return;
    setLinks((prev) => {
      const dup = prev.some((l) => (l.a === fromUid && l.b === toUid) || (l.a === toUid && l.b === fromUid));
      if (dup) return prev;
      return [...prev, { a: fromUid, b: toUid, link_type: "copper" }];
    });
  }
  function deleteLink(id: string) {
    const [a, b] = id.split("::");
    setLinks((prev) => prev.filter((l) => !(l.a === a && l.b === b)));
  }
  function updateDevice(patch: Partial<Device>) {
    setDevices((prev) => prev.map((d) => (d.id === selectedId ? { ...d, ...patch } : d)));
  }
  function updateLinkType(i: number, link_type: LinkType) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, link_type } : l)));
  }

  async function saveAndRun() {
    setBusy(true);
    setError(null);
    setEnergizing(true);
    try {
      const p = await ensureProject();
      const scene: TopologyScene = { devices, links, layout };
      await api.saveScene(p.id, scene as unknown as Record<string, unknown>);
      const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_ENERGIZE_MS));
      const [run] = await Promise.all([api.runProject<TopologyResult>(p.id), minDelay]);
      setLastRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastRun(null);
    } finally {
      setBusy(false);
      setEnergizing(false);
    }
  }

  const selected = devices.find((d) => d.id === selectedId);

  const pieces: Piece[] = devices.map((d) => ({
    uid: d.id, type: d.type, x: layout[d.id]?.x ?? 100, y: layout[d.id]?.y ?? 100,
    state: d.id === selectedId ? "selected" : "default",
    badge: d.ip ? `${d.ip}${d.vlan_id && d.vlan_id !== 1 ? ` vlan${d.vlan_id}` : ""}` : d.type === "firewall" ? d.default_action : undefined,
  }));
  const canvasLinks: CanvasLink[] = links.map((l) => ({
    id: `${l.a}::${l.b}`, fromUid: l.a, fromTerminal: "port", toUid: l.b, toTerminal: "port",
    label: l.link_type && l.link_type !== "copper" ? l.link_type : undefined,
  }));

  const subnetItems: ReadoutItem[] = Object.entries(lastRun?.result.subnets ?? {})
    .filter((entry): entry is [string, NonNullable<TopologyResult["subnets"][string]>] => !!entry[1])
    .map(([id, s]) => ({
      id,
      label: id,
      value: s.usable_hosts,
      decimals: 0,
      unit: "hosts",
      secondary: `${s.network}/${s.prefix} · másc ${s.netmask} · bcast ${s.broadcast}`,
      status: "good",
      statusLabel: s.first_host && s.last_host ? `${s.first_host} – ${s.last_host}` : undefined,
    }));

  const reachItems: ReadoutItem[] = (lastRun?.result.reachability ?? []).map((r, i) => ({
    id: `${r.a}-${r.b}-${i}`,
    label: `${r.a} ↔ ${r.b}`,
    value: r.hops ?? 0,
    decimals: 0,
    unit: "saltos",
    secondary: r.reason,
    status: r.l3_reachable ? "good" : "bad",
    statusLabel: r.l3_reachable ? "alcanzable (L3)" : "no alcanzable",
    noReading: r.hops === null,
  }));

  return (
    <main className="lab-networking">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <div className="lab-topbar">
        <h1>Laboratorio de Redes <PresenceBadge connected={connected} count={connectedCount} /></h1>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => setInfoOpen((v) => !v)} title="Sobre este laboratorio">
            <Info size={16} />
          </button>
          <ThemeToggle />
        </div>
      </div>
      {infoOpen && (
        <p className="subtitle info-popover">
          Arrastrá dispositivos al lienzo y conectalos para armar la topología. Subnetting IPv4 real
          (<code>ipaddress</code> de Python), VLANs que realmente cambian qué enlaces conducen, y reglas de
          firewall que realmente bloquean alcanzabilidad — adaptador{" "}
          <span className="badge">networking-topology v0.2.0</span> · nivel de fidelidad 2/5. Simulador
          conceptual de direccionamiento y topología, no una emulación de un SO de red real.
        </p>
      )}

      <section className="lab-console">
        <InteractiveCanvas
          pieceTypes={PIECE_TYPES}
          pieces={pieces}
          links={canvasLinks}
          selectedUid={selectedId}
          gridStyle="rack"
          paletteDocked
          energizing={energizing}
          onPlace={placeDevice}
          onMove={moveDevice}
          onSelect={setSelectedId}
          onDelete={deleteDevice}
          onLink={linkDevices}
          onLinkDelete={deleteLink}
        />

        {selected && (
          <div className="props-panel">
            <strong>{selected.id}</strong>
            <label>Tipo: {selected.type}</label>
            {(selected.type === "pc" || selected.type === "router" || selected.type === "ap") && (
              <>
                <label>IP <input value={selected.ip ?? ""} onChange={(e) => updateDevice({ ip: e.target.value })} style={{ width: 120 }} /></label>
                <label>/ <input type="number" value={selected.prefix ?? 24} onChange={(e) => updateDevice({ prefix: Number(e.target.value) })} style={{ width: 50 }} /></label>
                <label>VLAN <input type="number" value={selected.vlan_id ?? 1} onChange={(e) => updateDevice({ vlan_id: Number(e.target.value) })} style={{ width: 50 }} /></label>
              </>
            )}
            {selected.type === "firewall" && (
              <>
                <label>Por defecto:
                  <select value={selected.default_action ?? "allow"} onChange={(e) => updateDevice({ default_action: e.target.value as "allow" | "deny" })} style={{ marginLeft: 6 }}>
                    <option value="allow">permitir</option>
                    <option value="deny">denegar</option>
                  </select>
                </label>
                <FirewallRules device={selected} devices={devices} onChange={(rules) => updateDevice({ rules })} />
              </>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={saveAndRun} disabled={busy}>
            {energizing ? "Energizando…" : busy ? "Ejecutando…" : "Guardar y ejecutar"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}

        {links.length > 0 && (
          <>
            <h3>Tipo de enlace</h3>
            <table>
              <thead><tr><th>A</th><th>B</th><th>Tipo</th></tr></thead>
              <tbody>
                {links.map((l, i) => (
                  <tr key={`${l.a}-${l.b}`}>
                    <td>{l.a}</td><td>{l.b}</td>
                    <td>
                      <select value={l.link_type ?? "copper"} onChange={(e) => updateLinkType(i, e.target.value as "copper" | "fiber" | "wireless")}>
                        <option value="copper">cobre</option>
                        <option value="fiber">fibra</option>
                        <option value="wireless">inalámbrico</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Subred por dispositivo</h3>
        <RunConsole items={subnetItems} emptyLabel="Sin corrida todavía — armá la topología y ejecutá." />
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Alcanzabilidad</h3>
        <RunConsole items={reachItems} emptyLabel="Sin corrida todavía." />
      </section>

      <TutorPanel projectId={project?.id ?? null} />
    </main>
  );
}

function FirewallRules({ device, devices, onChange }: { device: Device; devices: Device[]; onChange: (rules: FirewallRule[]) => void }) {
  const rules = device.rules ?? [];
  const others = devices.filter((d) => d.id !== device.id && (d.type === "pc" || d.type === "router" || d.type === "ap"));
  return (
    <div className="row" style={{ width: "100%", marginTop: 6 }}>
      {rules.map((r, i) => (
        <span key={i} className="row" style={{ gap: 4 }}>
          <select value={r.other_id} onChange={(e) => {
            const next = [...rules]; next[i] = { ...r, other_id: e.target.value }; onChange(next);
          }}>
            {others.map((o) => <option key={o.id} value={o.id}>{o.id}</option>)}
          </select>
          <select value={r.action} onChange={(e) => {
            const next = [...rules]; next[i] = { ...r, action: e.target.value as "allow" | "deny" }; onChange(next);
          }}>
            <option value="allow">permitir</option>
            <option value="deny">denegar</option>
          </select>
          <button className="secondary" onClick={() => onChange(rules.filter((_, idx) => idx !== i))}>×</button>
        </span>
      ))}
      <button className="secondary" onClick={() => others.length && onChange([...rules, { other_id: others[0].id, action: "deny" }])}>
        + Regla
      </button>
    </div>
  );
}
