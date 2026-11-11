"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cable, Monitor, MousePointer2, Radio, Router, Scissors, Server, Shield, Trash2, Zap, Network } from "lucide-react";
import { Coach, Journal, logJournal, PhaseTrack, Phase, Predict, TopBar, Toast, useMissionProgress, useToast } from "../xp/Shell";
import { play } from "../xp/sound";
import { MISSIONS, NetDevice, NetScene as Scene, PingLog } from "./missions";
import type { Tool } from "./NetScene";
import { DeviceType, PacketTrace, packetTrace, parseIPv4, runTopology, subnetInfo } from "../lib/engines/networking";

const Stage = dynamic(() => import("../xp/Stage"), { ssr: false });
const NetScene = dynamic(() => import("./NetScene"), { ssr: false });

const FIDELITY = {
  level: "Nivel 2 · modelo determinista",
  computes: [
    "Subnetting IPv4 exacto (aritmética de 32 bits): red, broadcast, rango y hosts útiles.",
    "Alcance físico por BFS sobre los cables; las VLANs cortan aristas entre hosts.",
    "Alcance L3: subredes distintas requieren router en la ruta; firewalls evalúan reglas por origen antes de la acción por defecto.",
    "Traza salto a salto derivada de la ruta: TTL por router y MAC lógica por segmento.",
  ],
  omits: ["ARP, tablas de enrutamiento y protocolos dinámicos reales.", "Latencia, ancho de banda, colisiones o pérdida.", "Sistemas operativos de red o CLI reales."],
  source: "Motor portado 1:1 del solver Python del proyecto y verificado contra él (tools/golden: 213/213).",
};

const NEW_DEVICE: Record<DeviceType, { label: string; ip?: boolean }> = {
  pc: { label: "PC", ip: true }, server: { label: "Srv", ip: true }, router: { label: "R", ip: true },
  switch: { label: "SW" }, firewall: { label: "FW" }, ap: { label: "AP", ip: true },
};

export default function NetworkingLab() {
  const [missionIdx, setMissionIdx] = useState(0);
  const mission = MISSIONS[missionIdx];
  const [scene, setScene] = useState<Scene>(() => mission.scene());
  const [lens, setLens] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [trace, setTrace] = useState<PacketTrace | null>(null);
  const [traceKey, setTraceKey] = useState(0);
  const [frame, setFrame] = useState(0);
  const [flying, setFlying] = useState(false);
  const [pings, setPings] = useState<PingLog[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [truth, setTruth] = useState<string | null>(null);
  const [journal, setJournal] = useState(false);
  const { done, complete } = useMissionProgress("redes");
  const { msg, say } = useToast();

  const result = useMemo(() => runTopology(scene.devices, scene.links), [scene]);
  const objectivesDone = mission.objectives.map((o) => o.check(scene, pings));
  const allDone = mission.objectives.length > 0 && objectivesDone.every(Boolean);

  const phase: Phase = !accepted ? 0 : !prediction ? 1 : truth == null ? 2 : allDone ? 4 : 3;

  useEffect(() => {
    if (allDone && !done[mission.id]) {
      complete(mission.id);
      logJournal({ lab: "redes", kind: "mision", text: `Misión ${mission.code} «${mission.title}» completada.`, ok: true });
      say(`Misión «${mission.title}» completada. Lee la explicación.`, "good");
    }
  }, [allDone, done, mission, say, complete]);

  const loadMission = useCallback((i: number) => {
    setMissionIdx(i); setScene(MISSIONS[i].scene()); setSelected(null); setPending(null); setTrace(null);
    setPings([]); setAccepted(MISSIONS[i].id === "free"); setPrediction(MISSIONS[i].id === "free" ? "skip" : null); setTruth(MISSIONS[i].id === "free" ? "skip" : null); setTool("select");
  }, []);

  // VLAN: enlaces que no conducen (dos hosts de VLAN distinta sin router/firewall)
  const vlanCut = useMemo(() => {
    const by = new Map(scene.devices.map((d) => [d.id, d]));
    const s = new Set<string>();
    for (const l of scene.links) {
      const a = by.get(l.a), b = by.get(l.b);
      if (!a || !b) continue;
      const bridges = ["router", "firewall"];
      if (!bridges.includes(a.type) && !bridges.includes(b.type) && (a.vlan_id ?? 1) !== (b.vlan_id ?? 1)) s.add(`${l.a}|${l.b}`);
    }
    return s;
  }, [scene]);

  const sendPing = useCallback((a: string, b: string) => {
    if (a === b) return;
    const t = packetTrace(scene.devices, scene.links, a, b);
    if (!t) return;
    const isKey = (a === mission.keyPair[0] && b === mission.keyPair[1]) || (a === mission.keyPair[1] && b === mission.keyPair[0]);
    if (isKey && prediction && truth == null && prediction !== "skip") {
      const tr = mission.predict.truth(scene);
      setTruth(tr);
      logJournal({ lab: "redes", kind: "prediccion", text: `${mission.predict.question} → predije «${mission.predict.choices.find((c) => c.id === prediction)?.label}», resultado «${mission.predict.choices.find((c) => c.id === tr)?.label}».`, ok: prediction === tr });
    }
    if (!result.ok && result.errors.length) {
      // validación fallida: el motor no evalúa la red completa, pero la traza
      // del par sí es calculable (evaluatePair no exige red válida global).
    }
    play("send");
    setTrace(t); setTraceKey((k) => k + 1); setFrame(0); setFlying(true);
    setPings((p) => [...p, { a, b, delivered: t.delivered }]);
  }, [scene, mission, prediction, truth, result]);

  const traceRef = useRef<PacketTrace | null>(null);
  traceRef.current = trace;
  const onTraceDone = useCallback(() => {
    setFlying(false);
    const t = traceRef.current;
    if (t) {
      const by = new Map(scene.devices.map((d) => [d.id, d.label]));
      play(t.delivered ? "deliver" : "fail");
      say(t.delivered ? `ICMP echo entregado: ${by.get(t.pair.a)} → ${by.get(t.pair.b)} en ${t.pair.hops} saltos.` : `No entregado: ${t.pair.reason}.`, t.delivered ? "good" : "bad");
      logJournal({ lab: "redes", kind: "resultado", text: `Ping ${by.get(t.pair.a)} → ${by.get(t.pair.b)}: ${t.delivered ? "entregado" : "falló"} (${t.pair.reason}).`, ok: t.delivered });
    }
    if (!lens && accepted) setLens(true);
  }, [scene, say, lens, accepted]);

  function onDeviceClick(id: string) {
    if (tool === "select") { setSelected(id); return; }
    if (tool === "cable" || tool === "ping") {
      if (!pending) { setPending(id); return; }
      if (pending === id) { setPending(null); return; }
      if (tool === "cable") {
        const exists = scene.links.some((l) => (l.a === pending && l.b === id) || (l.a === id && l.b === pending));
        if (!exists) setScene((s) => ({ ...s, links: [...s.links, { a: pending, b: id }] }));
        play(exists ? "click" : "select");
        say(exists ? "Ya existe ese cable." : "Cable conectado.", exists ? "info" : "good");
      } else sendPing(pending, id);
      setPending(null);
    }
  }

  function addDevice(type: DeviceType) {
    const n = scene.devices.filter((d) => d.type === type).length + 1;
    const id = `${type}${Date.now() % 100000}`;
    const used = new Set(scene.devices.map((d) => d.ip));
    let host = 30 + n; while (used.has(`192.168.0.${host}`)) host++;
    const d: NetDevice = { id, type, label: `${NEW_DEVICE[type].label}-${n}`, pos: [(Math.random() - 0.5) * 5, 2.6 + Math.random()], vlan_id: 1 };
    if (NEW_DEVICE[type].ip) { d.ip = `192.168.0.${host}`; d.prefix = 24; }
    if (type === "firewall") { d.default_action = "allow"; d.rules = []; }
    setScene((s) => ({ ...s, devices: [...s.devices, d] }));
    setSelected(id); setTool("select");
  }

  const updateDevice = (id: string, patch: Partial<NetDevice>) => setScene((s) => ({ ...s, devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const deleteDevice = (id: string) => { setScene((s) => ({ devices: s.devices.filter((d) => d.id !== id), links: s.links.filter((l) => l.a !== id && l.b !== id) })); setSelected(null); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      const m: Record<string, Tool> = { v: "select", c: "cable", p: "ping", x: "cut" };
      if (m[e.key.toLowerCase()]) { setTool(m[e.key.toLowerCase()]); setPending(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) deleteDevice(selected);
      if (e.key === "Escape") { setPending(null); setSelected(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const sel = scene.devices.find((d) => d.id === selected) ?? null;
  const selInfo = sel ? subnetInfo(sel) : null;
  const curFrame = trace?.frames[Math.min(frame, (trace?.frames.length ?? 1) - 1)];
  const label = (id: string) => scene.devices.find((d) => d.id === id)?.label ?? id;
  const endpoints = scene.devices.filter((d) => d.ip != null);

  const hintBar = tool === "cable" ? (pending ? `Cable desde ${label(pending)}: toca el otro extremo` : "Cable: toca el primer equipo") :
    tool === "ping" ? (pending ? `Ping desde ${label(pending)}: elige el destino` : "Ping: toca el equipo de origen") :
    tool === "cut" ? "Cortar: toca un cable para eliminarlo" : "Arrastra equipos · clic para inspeccionar · rueda para zoom";

  return (
    <main className="xp">
      <Stage camera={{ position: [-1.8, 9.6, 11.2], fov: 40 }} fog={[16, 34]} bloom={1.1} onPointerMissed={() => { setSelected(null); }}>
        <NetScene scene={scene} lens={lens} tool={tool} selected={selected} pending={pending} trace={trace} traceKey={traceKey} vlanCut={vlanCut}
          onDeviceClick={onDeviceClick} onLinkClick={(i) => setScene((s) => ({ ...s, links: s.links.filter((_, j) => j !== i) }))}
          onMove={(id, pos) => updateDevice(id, { pos })} onTraceStep={(i) => { setFrame(i); if (i > 0) play("hop"); }} onTraceDone={onTraceDone} />
      </Stage>

      <div className="xp-hud">
        <TopBar code="LAB·02" title="Redes — ciudad de datos" lens={lens} onLens={() => setLens((v) => !v)} fidelity={FIDELITY} onJournal={() => setJournal((v) => !v)} />
        <Toast msg={msg} />

        {/* ---------- misión ---------- */}
        <aside className="xp-panel xp-panel-left" aria-label="Misión">
          <div className="xp-panel-section">
            <div className="xp-missions">
              {MISSIONS.map((m, i) => <button key={m.id} type="button" className={`xp-mission-tab ${i === missionIdx ? "is-active" : ""} ${done[m.id] ? "is-done" : ""}`} onClick={() => loadMission(i)}>{m.code}</button>)}
            </div>
            <p className="xp-eyebrow"><i /> Misión {mission.code}</p>
            <h2 className="xp-h2">{mission.title}</h2>
            {mission.brief.map((b) => <p key={b} className="xp-p">{b}</p>)}
            {mission.id !== "free" && <PhaseTrack phase={phase} />}
            {mission.id !== "free" && !accepted && <div className="xp-btn-row"><button className="xp-btn xp-btn-primary xp-btn-block" type="button" onClick={() => setAccepted(true)}>Aceptar misión</button></div>}
          </div>

          {accepted && mission.id !== "free" && (
            <div className="xp-panel-section">
              <Predict question={mission.predict.question} choices={mission.predict.choices} picked={prediction} onPick={(id) => { if (truth == null) setPrediction(id); }} truth={truth} locked={truth != null} />
              {prediction && truth == null && (
                <div className="xp-btn-row">
                  <button className="xp-btn xp-btn-cyan xp-btn-block" type="button" disabled={flying} onClick={() => sendPing(mission.keyPair[0], mission.keyPair[1])}>
                    <Zap size={14} /> Comprobar: ping {label(mission.keyPair[0])} → {label(mission.keyPair[1])}
                  </button>
                </div>
              )}
              {truth != null && <div className={`xp-verdict ${truth === prediction ? "good" : "bad"}`}>{truth === prediction ? "Tu predicción coincide con el modelo." : "El modelo contradice tu predicción: ese contraste es el aprendizaje. Activa la lente para ver por qué."}</div>}
            </div>
          )}

          {accepted && mission.objectives.length > 0 && prediction && (
            <div className="xp-panel-section">
              <p className="xp-eyebrow"><i /> Objetivos</p>
              <ul className="xp-objectives">{mission.objectives.map((o, i) => <li key={o.id} className={objectivesDone[i] ? "is-done" : ""}>{o.text}</li>)}</ul>
              {!allDone && <p className="xp-p xp-small xp-muted" style={{ marginTop: 10 }}>Pista: {mission.hint}</p>}
            </div>
          )}

          {(allDone || mission.id === "free") && (mission.explain.text.length > 0 || mission.id === "free") && (
            <div className="xp-panel-section">
              <p className="xp-eyebrow"><i /> {mission.id === "free" ? "Atajos" : "Explicación"}</p>
              {mission.explain.text.map((t) => <p key={t} className="xp-p">{t}</p>)}
              {mission.id === "free" && <p className="xp-p xp-muted">{mission.hint}</p>}
              {mission.explain.formula && <div className="xp-formula" style={{ marginTop: 10 }}>{mission.explain.formula(scene)}</div>}
              {allDone && missionIdx < MISSIONS.length - 1 && <div className="xp-btn-row"><button type="button" className="xp-btn xp-btn-primary xp-btn-block" onClick={() => loadMission(missionIdx + 1)}>Siguiente misión →</button></div>}
            </div>
          )}
        </aside>

        {/* ---------- inspector / paquete / matriz ---------- */}
        {!journal && (
          <aside className="xp-panel xp-panel-right" aria-label="Inspector">
            {trace && curFrame && (
              <div className="xp-panel-section">
                <p className="xp-eyebrow"><i style={{ background: trace.delivered ? "var(--xp-cyan)" : "var(--xp-bad)" }} /> Paquete {flying ? "en vuelo" : "— último"} · tramo {frame + 1}/{trace.frames.length}</p>
                <dl className="xp-kv">
                  <dt>L2 origen</dt><dd>{curFrame.l2_src}</dd>
                  <dt>L2 destino</dt><dd>{curFrame.l2_dst}</dd>
                  {curFrame.vlan && <><dt>802.1Q</dt><dd>VLAN {curFrame.vlan}</dd></>}
                  <dt>IP origen</dt><dd>{trace.src_ip}</dd>
                  <dt>IP destino</dt><dd>{trace.dst_ip}</dd>
                  <dt>TTL</dt><dd style={{ color: "var(--xp-amber)" }}>{curFrame.ttl}</dd>
                  <dt>Protocolo</dt><dd>{trace.protocol}</dd>
                  <dt>Tramo</dt><dd>{label(curFrame.at)} → {label(curFrame.to)}</dd>
                </dl>
                <p className="xp-p xp-small" style={{ marginTop: 8, color: "var(--xp-cyan)" }}>{curFrame.note}</p>
              </div>
            )}

            {sel ? (
              <div className="xp-panel-section">
                <p className="xp-eyebrow"><i /> Inspector · {sel.type.toUpperCase()}</p>
                <div className="xp-field"><label htmlFor="d-label">Nombre</label><input id="d-label" className="xp-input" value={sel.label} onChange={(e) => updateDevice(sel.id, { label: e.target.value })} /></div>
                {sel.ip != null && (
                  <>
                    <div className="xp-row">
                      <div className="xp-field"><label htmlFor="d-ip">IPv4</label><input id="d-ip" className={`xp-input ${parseIPv4(sel.ip) == null ? "is-invalid" : ""}`} value={sel.ip} onChange={(e) => updateDevice(sel.id, { ip: e.target.value })} /></div>
                      <div className="xp-field"><label htmlFor="d-vlan">VLAN</label><input id="d-vlan" type="number" min={1} max={4094} className="xp-input" value={sel.vlan_id ?? 1} onChange={(e) => updateDevice(sel.id, { vlan_id: Math.max(1, Math.min(4094, Number(e.target.value) || 1)) })} /></div>
                    </div>
                    <div className="xp-field"><label htmlFor="d-prefix">Prefijo /{sel.prefix}</label><input id="d-prefix" type="range" min={8} max={30} className="xp-range" value={sel.prefix ?? 24} onChange={(e) => updateDevice(sel.id, { prefix: Number(e.target.value) })} /></div>
                    {selInfo && (
                      <dl className="xp-kv" style={{ marginTop: 10 }}>
                        <dt>Máscara</dt><dd>{selInfo.netmask}</dd><dt>Red</dt><dd>{selInfo.network}</dd><dt>Broadcast</dt><dd>{selInfo.broadcast}</dd>
                        <dt>Rango</dt><dd>{selInfo.first_host} – {selInfo.last_host}</dd><dt>Hosts útiles</dt><dd style={{ color: "var(--xp-amber)" }}>{selInfo.usable_hosts.toLocaleString("es")}</dd>
                      </dl>
                    )}
                  </>
                )}
                {sel.type === "firewall" && (
                  <>
                    <div className="xp-field"><label htmlFor="d-def">Acción por defecto</label>
                      <select id="d-def" className="xp-select" value={sel.default_action ?? "allow"} onChange={(e) => updateDevice(sel.id, { default_action: e.target.value as "allow" | "deny" })}><option value="allow">ALLOW (permitir)</option><option value="deny">DENY (denegar)</option></select>
                    </div>
                    <p className="xp-eyebrow" style={{ marginTop: 12 }}>Reglas por origen/destino</p>
                    {endpoints.map((ep) => {
                      const rule = sel.rules?.find((r) => r.other_id === ep.id);
                      return (
                        <div key={ep.id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                          <span className="xp-mono xp-small" style={{ flex: 1 }}>{ep.label}</span>
                          <select className="xp-select" style={{ width: 120, height: 30 }} aria-label={`Regla para ${ep.label}`} value={rule?.action ?? ""}
                            onChange={(e) => {
                              const v = e.target.value as "" | "allow" | "deny";
                              const rules = (sel.rules ?? []).filter((r) => r.other_id !== ep.id);
                              updateDevice(sel.id, { rules: v ? [...rules, { other_id: ep.id, action: v }] : rules });
                            }}>
                            <option value="">— (defecto)</option><option value="allow">ALLOW</option><option value="deny">DENY</option>
                          </select>
                        </div>
                      );
                    })}
                  </>
                )}
                <div className="xp-btn-row">
                  <button type="button" className="xp-btn xp-btn-cyan" onClick={() => { setTool("ping"); setPending(sel.id); }}><Zap size={13} /> Ping desde aquí</button>
                  <button type="button" className="xp-btn xp-btn-danger" onClick={() => deleteDevice(sel.id)}><Trash2 size={13} /> Eliminar</button>
                </div>
              </div>
            ) : (
              <div className="xp-panel-section">
                <p className="xp-eyebrow"><i /> Estado de la red</p>
                {result.ok ? <p className="xp-p xp-muted">Topología válida · {scene.devices.length} equipos · {scene.links.length} cables.</p>
                  : <ul className="xp-objectives">{result.errors.slice(0, 4).map((e) => <li key={e} style={{ color: "var(--xp-bad)" }}>{e}</li>)}</ul>}
                <p className="xp-p xp-small xp-muted" style={{ marginTop: 8 }}>Selecciona un equipo para ver su subred calculada en vivo.</p>
              </div>
            )}

            {lens && result.ok && endpoints.length > 1 && (
              <div className="xp-panel-section">
                <p className="xp-eyebrow"><i style={{ background: "var(--xp-cyan)" }} /> Matriz de alcance L3</p>
                <div style={{ display: "grid", gridTemplateColumns: `70px repeat(${endpoints.length}, 1fr)`, gap: 2, fontFamily: "var(--xp-mono)", fontSize: 10 }}>
                  <span />
                  {endpoints.map((e) => <span key={e.id} style={{ textAlign: "center", color: "var(--xp-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label.slice(0, 5)}</span>)}
                  {endpoints.map((r) => (
                    <FragmentRow key={r.id} r={r} endpoints={endpoints} pairs={result.reachability} onPing={sendPing} />
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        <Journal lab="redes" open={journal} onClose={() => setJournal(false)} />
        <Coach lab="redes" steps={[
          { title: "Primero, predice", text: "Cada misión plantea una pregunta sobre la red. Elige tu respuesta antes de enviar el ping: el resultado calculado la confirmará o la desmentirá." },
          { title: "Construye y prueba", text: "Arrastra equipos, conéctalos con Cable y envía un Ping. El paquete recorre la ruta real y su ficha muestra la encapsulación en cada tramo.", kbd: "C · P" },
          { title: "Enciende la lente", text: "Revela las subredes como distritos, las VLAN, los cables que no conducen y la matriz de alcance de toda la red.", kbd: "L" },
        ]} />

        {/* ---------- dock ---------- */}
        <div className="xp-hint-bar">{hintBar}</div>
        <nav className="xp-dock" aria-label="Herramientas">
          {([["select", "Mover", MousePointer2, "V"], ["cable", "Cable", Cable, "C"], ["ping", "Ping", Zap, "P"], ["cut", "Cortar", Scissors, "X"]] as const).map(([id, l, Icon, k]) => (
            <button key={id} type="button" className={`xp-tool ${tool === id ? "is-active" : ""}`} onClick={() => { setTool(id); setPending(null); }} title={`${l} (${k})`}><Icon />{l}</button>
          ))}
          <span className="xp-dock-sep" />
          {([["pc", "PC", Monitor], ["switch", "Switch", Network], ["router", "Router", Router], ["firewall", "Firewall", Shield], ["server", "Servidor", Server], ["ap", "AP", Radio]] as const).map(([t, l, Icon]) => (
            <button key={t} type="button" className="xp-tool" onClick={() => addDevice(t)} title={`Añadir ${l}`}><Icon />{l}</button>
          ))}
        </nav>
      </div>
    </main>
  );
}

function FragmentRow({ r, endpoints, pairs, onPing }: { r: NetDevice; endpoints: NetDevice[]; pairs: ReturnType<typeof runTopology>["reachability"]; onPing: (a: string, b: string) => void }) {
  return (
    <>
      <span style={{ color: "var(--xp-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
      {endpoints.map((c) => {
        if (c.id === r.id) return <span key={c.id} style={{ background: "rgba(255,255,255,.03)", borderRadius: 3 }} />;
        const p = pairs.find((x) => (x.a === r.id && x.b === c.id) || (x.a === c.id && x.b === r.id));
        const ok = p?.l3_reachable;
        return (
          <button key={c.id} type="button" title={p?.reason} onClick={() => onPing(r.id, c.id)}
            style={{ height: 20, border: 0, borderRadius: 3, cursor: "pointer", background: ok ? "rgba(93,242,165,.22)" : "rgba(255,93,108,.18)", color: ok ? "var(--xp-good)" : "var(--xp-bad)" }}>
            {ok ? "●" : "×"}
          </button>
        );
      })}
    </>
  );
}
