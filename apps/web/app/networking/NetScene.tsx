"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Grid, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { NetDevice, NetScene as Scene } from "./missions";
import { HopFrame, PacketTrace, subnetInfo } from "../lib/engines/networking";

export type Tool = "select" | "cable" | "ping" | "cut";

interface Props {
  scene: Scene;
  lens: boolean;
  tool: Tool;
  selected: string | null;
  pending: string | null;           // primer extremo elegido en cable/ping
  trace: PacketTrace | null;
  traceKey: number;
  vlanCut: Set<string>;             // enlaces "a|b" que no conducen por VLAN
  onDeviceClick: (id: string) => void;
  onLinkClick: (index: number) => void;
  onMove: (id: string, pos: [number, number]) => void;
  onTraceStep: (frameIndex: number) => void;
  onTraceDone: () => void;
}

const PORT_Y = 0.32;
const devPos = (d: NetDevice) => new THREE.Vector3(d.pos[0], 0, d.pos[1]);

export function subnetColor(key: string | null): THREE.Color {
  if (!key) return new THREE.Color("#3b4660");
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL(((h % 360) / 360), 0.75, 0.58);
}
export const netKey = (d: NetDevice) => { const s = subnetInfo(d); return s ? `${s.network}/${s.prefix}` : null; };

function cableCurve(a: THREE.Vector3, b: THREE.Vector3) {
  const p0 = a.clone().setY(PORT_Y), p2 = b.clone().setY(PORT_Y);
  const mid = p0.clone().add(p2).multiplyScalar(0.5);
  mid.y = PORT_Y + 0.25 + p0.distanceTo(p2) * 0.07;
  return new THREE.QuadraticBezierCurve3(p0, mid, p2);
}

// ---------- modelos de equipos (geometría procedural) ----------
const metal = { metalness: 0.75, roughness: 0.32 };

function PCModel({ accent }: { accent: string }) {
  return (
    <group>
      <RoundedBox args={[0.62, 0.42, 0.05]} radius={0.02} position={[0, 0.52, 0]} castShadow>
        <meshPhysicalMaterial color="#1a2131" {...metal} clearcoat={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.52, 0.027]}>
        <planeGeometry args={[0.56, 0.36]} />
        <meshStandardMaterial color="#061018" emissive={accent} emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.22, -0.02]} castShadow><cylinderGeometry args={[0.03, 0.03, 0.22, 12]} /><meshStandardMaterial color="#2a3346" {...metal} /></mesh>
      <mesh position={[0, 0.11, -0.02]} castShadow><boxGeometry args={[0.3, 0.02, 0.18]} /><meshStandardMaterial color="#2a3346" {...metal} /></mesh>
    </group>
  );
}

function SwitchModel({ leds }: { leds: string }) {
  return (
    <group>
      <RoundedBox args={[0.95, 0.14, 0.42]} radius={0.025} position={[0, 0.2, 0]} castShadow>
        <meshPhysicalMaterial color="#20293b" {...metal} clearcoat={0.4} />
      </RoundedBox>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[-0.36 + i * 0.1, 0.22, 0.212]}>
          <boxGeometry args={[0.06, 0.04, 0.01]} />
          <meshStandardMaterial color="#000" emissive={leds} emissiveIntensity={i % 3 === 0 ? 2.4 : 0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function RouterModel() {
  return (
    <group>
      <RoundedBox args={[0.7, 0.18, 0.48]} radius={0.04} position={[0, 0.2, 0]} castShadow>
        <meshPhysicalMaterial color="#2a2416" {...metal} clearcoat={0.5} />
      </RoundedBox>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.48, -0.16]} rotation={[0, 0, x > 0 ? -0.18 : 0.18]} castShadow>
          <cylinderGeometry args={[0.018, 0.022, 0.42, 10]} /><meshStandardMaterial color="#141820" {...metal} />
        </mesh>
      ))}
      <mesh position={[0, 0.295, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.07, 0.1, 32]} /><meshStandardMaterial color="#000" emissive="#ffb547" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
    </group>
  );
}

function FirewallModel({ armed }: { armed: boolean }) {
  return (
    <group>
      <RoundedBox args={[0.6, 0.62, 0.36]} radius={0.04} position={[0, 0.36, 0]} castShadow>
        <meshPhysicalMaterial color="#2a1418" {...metal} clearcoat={0.5} />
      </RoundedBox>
      {[0.18, 0.36, 0.54].map((y, r) => (
        <mesh key={y} position={[r % 2 ? 0.07 : -0.07, y, 0.185]}>
          <boxGeometry args={[0.36, 0.1, 0.01]} />
          <meshStandardMaterial color="#000" emissive={armed ? "#ff5d6c" : "#7a3a40"} emissiveIntensity={armed ? 1.8 : 0.5} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function ServerModel() {
  return (
    <group>
      <RoundedBox args={[0.46, 0.86, 0.5]} radius={0.03} position={[0, 0.45, 0]} castShadow>
        <meshPhysicalMaterial color="#161c2a" {...metal} clearcoat={0.5} />
      </RoundedBox>
      {[0.2, 0.38, 0.56, 0.74].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.252]}><boxGeometry args={[0.38, 0.12, 0.005]} /><meshStandardMaterial color="#0a0e16" {...metal} /></mesh>
          <mesh position={[0.15, y, 0.257]}><sphereGeometry args={[0.012, 8, 8]} /><meshStandardMaterial color="#000" emissive="#5df2a5" emissiveIntensity={2.5} toneMapped={false} /></mesh>
        </group>
      ))}
    </group>
  );
}

function APModel() {
  return (
    <group>
      <mesh position={[0, 0.16, 0]} castShadow><cylinderGeometry args={[0.3, 0.34, 0.1, 40]} /><meshPhysicalMaterial color="#e8edf6" roughness={0.35} clearcoat={0.8} /></mesh>
      <mesh position={[0, 0.215, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.1, 0.13, 40]} /><meshStandardMaterial color="#000" emissive="#5ee7ff" emissiveIntensity={2.2} toneMapped={false} /></mesh>
    </group>
  );
}

function DeviceNode({ d, scene, lens, selected, pending, tool, onClick, onDragStart }: {
  d: NetDevice; scene: Scene; lens: boolean; selected: boolean; pending: boolean; tool: Tool;
  onClick: () => void; onDragStart: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const [hover, setHover] = useState(false);
  const key = netKey(d);
  const color = subnetColor(key);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.04;
      ring.current.scale.setScalar(selected || pending ? s : 1);
    }
  });
  const armed = d.type === "firewall" && ((d.rules?.some((r) => r.action === "deny")) || d.default_action === "deny");
  const accent = lens && key ? `#${color.getHexString()}` : "#3fa9ff";
  const vlan = d.vlan_id ?? 1;
  return (
    <group position={devPos(d)}>
      <group
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = tool === "select" ? "grab" : "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
        onPointerDown={(e) => { e.stopPropagation(); if (tool === "select") onDragStart(e); }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        scale={hover ? 1.06 : 1}
      >
        {/* base/pedestal que da lectura de "pieza" */}
        <mesh position={[0, 0.03, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.55, 0.6, 0.06, 48]} />
          <meshPhysicalMaterial color="#0d1320" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh ref={ring} position={[0, 0.065, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.52, 0.56, 64]} />
          <meshStandardMaterial color="#000" emissive={selected ? "#ffb547" : pending ? "#5ee7ff" : lens && key ? accent : "#2c3a55"} emissiveIntensity={selected || pending ? 3 : lens ? 1.6 : 1} toneMapped={false} />
        </mesh>
        {d.type === "pc" && <PCModel accent={accent} />}
        {d.type === "switch" && <SwitchModel leds={lens ? "#5df2a5" : "#3fd68b"} />}
        {d.type === "router" && <RouterModel />}
        {d.type === "firewall" && <FirewallModel armed={armed} />}
        {d.type === "server" && <ServerModel />}
        {d.type === "ap" && <APModel />}
        {/* hit-box generoso para clic/arrastre */}
        <mesh position={[0, 0.4, 0]} visible={false}><cylinderGeometry args={[0.6, 0.6, 0.9, 12]} /></mesh>
      </group>
      {lens && vlan !== 1 && (
        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.66, 0.7, 64, 1, 0, Math.PI * 1.6]} />
          <meshStandardMaterial color="#000" emissive="#a78bfa" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      )}
      <Html position={[0, d.type === "server" ? 1.1 : d.type === "firewall" ? 0.95 : 0.95, 0]} center zIndexRange={[10, 0]}>
        <div className={`xp-label3d ${selected ? "is-sel" : ""}`}>
          {d.label}
          {d.ip && <small>{d.ip}/{d.prefix}</small>}
          {lens && vlan !== 1 && <small style={{ color: "#a78bfa" }}>VLAN {vlan}</small>}
          {d.type === "firewall" && <small style={{ color: armed ? "#ff5d6c" : "#7f8ca8" }}>{(d.rules?.length ?? 0)} regla(s) · def. {d.default_action}</small>}
        </div>
      </Html>
    </group>
  );
}

function Cable({ curve, state, lens, onClick, tool, color }: { curve: THREE.QuadraticBezierCurve3; state: "ok" | "cut"; lens: boolean; onClick: () => void; tool: Tool; color: THREE.Color }) {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 40, 0.022, 8, false), [curve]);
  const [hover, setHover] = useState(false);
  const c = state === "cut" ? "#ff5d6c" : lens ? `#${color.getHexString()}` : "#4a5b7d";
  return (
    <mesh geometry={geo} castShadow
      onPointerOver={(e) => { if (tool === "cut") { e.stopPropagation(); setHover(true); document.body.style.cursor = "crosshair"; } }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
      onClick={(e) => { if (tool === "cut") { e.stopPropagation(); onClick(); } }}>
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={hover ? 2.5 : state === "cut" ? 1.2 : lens ? 0.9 : 0.15} roughness={0.5} metalness={0.2} toneMapped={!hover && !lens} />
    </mesh>
  );
}

/** Ficha de encapsulación que viaja con el paquete: las capas tal como van
 * en ESTE tramo. Resalta lo que cambió respecto del tramo anterior (MAC
 * reescrita y TTL decrementado por el router; IP de extremo a extremo intacta). */
function Encapsulation({ frame, prev, trace, color }: { frame: HopFrame; prev: HopFrame | null; trace: PacketTrace; color: string }) {
  const macChanged = !!prev && prev.l2_src !== frame.l2_src;
  const ttlChanged = !!prev && prev.ttl !== frame.ttl;
  const row = (k: string, v: string, hot = false) => (
    <div className={`xp-encap-row ${hot ? "hot" : ""}`}><span>{k}</span><b>{v}</b></div>
  );
  return (
    <Html position={[0, 0.32, 0]} center zIndexRange={[20, 0]}>
      <div className="xp-encap" style={{ borderColor: color }}>
        <div className="xp-encap-layer l2">
          <i>L2 · Ethernet{frame.vlan ? ` · 802.1Q VLAN ${frame.vlan}` : ""}</i>
          {row("src", frame.l2_src.slice(-8), macChanged)}
          {row("dst", frame.l2_dst.slice(-8), macChanged)}
          <div className="xp-encap-layer l3">
            <i>L3 · IPv4</i>
            {row("src", trace.src_ip)}
            {row("dst", trace.dst_ip)}
            {row("TTL", String(frame.ttl), ttlChanged)}
            <div className="xp-encap-layer l4"><i>ICMP · echo request</i></div>
          </div>
        </div>
        {(macChanged || ttlChanged) && <p className="xp-encap-note">El router reescribió la trama L2{ttlChanged ? " y bajó el TTL" : ""}; la IP no cambia.</p>}
      </div>
    </Html>
  );
}

/** Paquete en vuelo: recorre los tramos de la traza calculada. */
function Packet({ trace, curves, onStep, onDone }: { trace: PacketTrace; curves: Map<string, { curve: THREE.QuadraticBezierCurve3; reversed: boolean }>; onStep: (i: number) => void; onDone: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Mesh>(null);
  const t = useRef({ seg: 0, u: 0, pause: 0.25, finished: false, burstT: 0, lastSeg: -1 });
  const [seg, setSeg] = useState(0);
  const [ended, setEnded] = useState(false);
  const segs = trace.frames;
  const delivered = trace.delivered;
  useFrame((_, dt) => {
    const s = t.current;
    if (!ref.current) return;
    if (s.finished) {
      s.burstT += dt;
      if (burst.current) {
        const k = Math.min(s.burstT / 0.7, 1);
        burst.current.scale.setScalar(0.2 + k * 2.2);
        (burst.current.material as THREE.MeshStandardMaterial).opacity = 1 - k;
      }
      return;
    }
    if (s.seg !== s.lastSeg) { s.lastSeg = s.seg; onStep(s.seg); setSeg(s.seg); }
    if (s.pause > 0) { s.pause -= dt; return; }
    const f = segs[s.seg];
    if (!f) { s.finished = true; onDone(); return; }
    const c = curves.get(`${f.at}|${f.to}`);
    if (!c) { s.finished = true; onDone(); return; }
    s.u += dt * 1.15;
    const u = Math.min(s.u, 1);
    ref.current.position.copy(c.curve.getPoint(c.reversed ? 1 - u : u));
    if (s.u >= 1) {
      const blockedHere = trace.stop_at === f.to;
      const last = s.seg === segs.length - 1;
      if (blockedHere || last) { s.finished = true; setEnded(true); onDone(); }
      else { s.seg += 1; s.u = 0; s.pause = 0.22; }
    }
  });
  const col = delivered ? "#5ee7ff" : "#ff5d6c";
  return (
    <group ref={ref} position={[0, -10, 0]}>
      <mesh><sphereGeometry args={[0.09, 24, 24]} /><meshStandardMaterial color={col} emissive={col} emissiveIntensity={6} toneMapped={false} /></mesh>
      <pointLight color={col} intensity={3} distance={2.2} />
      <mesh ref={burst} scale={0.01}><sphereGeometry args={[0.12, 24, 24]} /><meshStandardMaterial color={col} emissive={col} emissiveIntensity={4} transparent opacity={0} toneMapped={false} depthWrite={false} /></mesh>
      {segs[seg] && !ended && <Encapsulation frame={segs[seg]} prev={seg > 0 ? segs[seg - 1] : null} trace={trace} color={col} />}
    </group>
  );
}

export default function NetScene({ scene, lens, tool, selected, pending, trace, traceKey, vlanCut, onDeviceClick, onLinkClick, onMove, onTraceStep, onTraceDone }: Props) {
  const byId = useMemo(() => new Map(scene.devices.map((d) => [d.id, d])), [scene.devices]);
  const [dragging, setDragging] = useState<string | null>(null);
  const controls = useRef<any>(null);

  const linkCurves = useMemo(() => scene.links.map((l) => {
    const a = byId.get(l.a), b = byId.get(l.b);
    return a && b ? cableCurve(devPos(a), devPos(b)) : null;
  }), [scene.links, byId]);

  const curveIndex = useMemo(() => {
    const m = new Map<string, { curve: THREE.QuadraticBezierCurve3; reversed: boolean }>();
    scene.links.forEach((l, i) => {
      const c = linkCurves[i];
      if (!c) return;
      m.set(`${l.a}|${l.b}`, { curve: c, reversed: false });
      m.set(`${l.b}|${l.a}`, { curve: c, reversed: true });
    });
    return m;
  }, [scene.links, linkCurves]);

  // distritos de subred para la lente: un disco por red, bajo sus equipos
  const districts = useMemo(() => {
    const groups = new Map<string, NetDevice[]>();
    for (const d of scene.devices) { const k = netKey(d); if (k) groups.set(k, [...(groups.get(k) ?? []), d]); }
    return [...groups.entries()].map(([k, ds]) => {
      const cx = ds.reduce((s, d) => s + d.pos[0], 0) / ds.length, cz = ds.reduce((s, d) => s + d.pos[1], 0) / ds.length;
      const r = Math.max(1.1, ...ds.map((d) => Math.hypot(d.pos[0] - cx, d.pos[1] - cz) + 0.95));
      return { k, cx, cz, r, color: subnetColor(k), hosts: subnetInfo(ds[0])?.usable_hosts ?? 0 };
    });
  }, [scene.devices]);

  return (
    <>
      <OrbitControls ref={controls} makeDefault enabled={!dragging} target={[-1.8, 0, 0.4]} maxPolarAngle={1.32} minDistance={4} maxDistance={22} enableDamping />
      <hemisphereLight args={["#9fb8ff", "#120d06", 0.35]} />
      <directionalLight position={[6, 10, 5]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <spotLight position={[-8, 7, -6]} angle={0.5} penumbra={1} intensity={30} color="#5ee7ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow
        onPointerMove={(e) => { if (dragging) { e.stopPropagation(); onMove(dragging, [Math.round(e.point.x * 10) / 10, Math.round(e.point.z * 10) / 10]); } }}
        onPointerUp={() => { if (dragging) { setDragging(null); document.body.style.cursor = ""; } }}
        onPointerLeave={() => setDragging(null)}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#05080f" roughness={0.85} metalness={0.2} />
      </mesh>
      <Grid position={[0, 0.002, 0]} args={[40, 40]} cellSize={0.5} cellThickness={0.6} cellColor="#141c2c" sectionSize={2.5} sectionThickness={1} sectionColor="#1f2b44" fadeDistance={26} fadeStrength={1.6} infiniteGrid />

      {lens && districts.map((z) => (
        <group key={z.k} position={[z.cx, 0.01, z.cz]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[z.r, 64]} />
            <meshBasicMaterial color={z.color} transparent opacity={0.07} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[z.r - 0.02, z.r, 96]} />
            <meshStandardMaterial color="#000" emissive={z.color} emissiveIntensity={1.4} toneMapped={false} transparent opacity={0.8} />
          </mesh>
          <Html position={[0, 0.02, -z.r - 0.15]} center zIndexRange={[5, 0]}>
            <div className="xp-label3d" style={{ borderColor: `#${z.color.getHexString()}`, color: `#${z.color.getHexString()}` }}>RED {z.k}<small style={{ color: "#7f8ca8" }}>{z.hosts} hosts útiles</small></div>
          </Html>
        </group>
      ))}

      {scene.links.map((l, i) => linkCurves[i] && (
        <Cable key={`${l.a}-${l.b}-${i}`} curve={linkCurves[i]!} tool={tool} lens={lens} onClick={() => onLinkClick(i)}
          state={vlanCut.has(`${l.a}|${l.b}`) ? "cut" : "ok"} color={subnetColor(netKey(byId.get(l.a)!) ?? netKey(byId.get(l.b)!))} />
      ))}

      {scene.devices.map((d) => (
        <DeviceNode key={d.id} d={d} scene={scene} lens={lens} tool={tool} selected={selected === d.id} pending={pending === d.id}
          onClick={() => onDeviceClick(d.id)}
          onDragStart={() => { setDragging(d.id); document.body.style.cursor = "grabbing"; }} />
      ))}

      {trace && <Packet key={traceKey} trace={trace} curves={curveIndex} onStep={onTraceStep} onDone={onTraceDone} />}
    </>
  );
}
