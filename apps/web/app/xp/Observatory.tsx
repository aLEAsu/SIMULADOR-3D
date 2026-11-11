"use client";

/**
 * Observatorio: la entrada es un espacio 3D, no una grilla de tarjetas.
 * Tres pedestales con dioramas vivos (cada uno anticipa la "lente" de su
 * laboratorio) y un anillo trasero de monolitos para los laboratorios
 * clásicos. Al elegir, la cámara vuela hacia el pedestal y luego navega.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Float, Html, MeshReflectorMaterial, Sparkles } from "@react-three/drei";
import * as THREE from "three";

export interface Station { id: string; href: string; angle: number; color: string; kind: "anatomy" | "network" | "robot"; }
export interface Monolith { id: string; href: string; label: string; angle: number; color: string; }

const R = 4.2;
export const stationPos = (a: number) => new THREE.Vector3(Math.sin(a) * R, 0, -Math.cos(a) * R + 2.2);

function holoMat(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vY = w.y; vec4 mv = viewMatrix*w; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = pow(1.0-abs(dot(vN,vV)),2.0); float scan = smoothstep(0.0,0.02,abs(fract(vY*1.2 - uTime*0.35)-0.5)-0.47);
      float lines = 0.55+0.45*step(0.5,fract(vY*60.0)); gl_FragColor = vec4(uColor*(f*1.8+0.15+ (1.0-scan)*1.5)*lines, (0.12+f*0.7)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function HoloHuman({ color, active }: { color: string; active: boolean }) {
  const mat = useMemo(() => holoMat(color), [color]);
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => { mat.uniforms.uTime.value = clock.elapsedTime; if (g.current) g.current.rotation.y += dt * (active ? 0.9 : 0.3); });
  const limb = (p: [number, number, number], len: number, r: number, rot: [number, number, number] = [0, 0, 0]) => (
    <mesh position={p} rotation={rot} material={mat}><capsuleGeometry args={[r, len, 8, 16]} /></mesh>
  );
  return (
    <group ref={g} position={[0, 0.62, 0]} scale={0.62}>
      <mesh position={[0, 1.62, 0]} material={mat}><sphereGeometry args={[0.13, 32, 32]} /></mesh>
      {limb([0, 1.15, 0], 0.5, 0.17)}
      {limb([0, 0.82, 0], 0.12, 0.15)}
      {limb([-0.27, 1.12, 0], 0.5, 0.055, [0, 0, 0.12])}
      {limb([0.27, 1.12, 0], 0.5, 0.055, [0, 0, -0.12])}
      {limb([-0.1, 0.35, 0], 0.62, 0.075)}
      {limb([0.1, 0.35, 0], 0.62, 0.075)}
      {/* corazón: lo "invisible" que la lente revela */}
      <mesh position={[0.04, 1.22, 0.06]}><sphereGeometry args={[0.045, 16, 16]} /><meshStandardMaterial color="#000" emissive="#ff4d6d" emissiveIntensity={active ? 5 : 2.5} toneMapped={false} /></mesh>
    </group>
  );
}

function MiniNetwork({ color, active }: { color: string; active: boolean }) {
  const nodes = useMemo(() => [[-0.5, 0.75, -0.2], [0.5, 0.75, -0.25], [0, 0.95, 0.35], [-0.35, 1.25, 0.3], [0.4, 1.3, 0.15]].map((p) => new THREE.Vector3(...(p as [number, number, number]))), []);
  const edges = useMemo(() => [[0, 2], [1, 2], [2, 3], [2, 4], [3, 4], [0, 3]] as const, []);
  const curves = useMemo(() => edges.map(([a, b]) => { const m = nodes[a].clone().add(nodes[b]).multiplyScalar(0.5); m.y += 0.18; return new THREE.QuadraticBezierCurve3(nodes[a], m, nodes[b]); }), [nodes, edges]);
  const packets = useRef<THREE.Mesh[]>([]);
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    if (g.current) g.current.rotation.y += dt * (active ? 0.6 : 0.2);
    packets.current.forEach((p, i) => { if (!p) return; const t = (clock.elapsedTime * (active ? 0.9 : 0.45) + i * 0.37) % 1; p.position.copy(curves[i % curves.length].getPoint(t)); });
  });
  return (
    <group ref={g}>
      {curves.map((c, i) => (
        <mesh key={i}><tubeGeometry args={[c, 24, 0.008, 6, false]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} toneMapped={false} /></mesh>
      ))}
      {nodes.map((n, i) => (
        <mesh key={i} position={n}><boxGeometry args={[0.13, 0.08, 0.13]} /><meshPhysicalMaterial color="#1a2335" metalness={0.8} roughness={0.3} emissive={color} emissiveIntensity={0.2} /></mesh>
      ))}
      {curves.map((_, i) => (
        <mesh key={`p${i}`} ref={(m) => { if (m) packets.current[i] = m; }}><sphereGeometry args={[0.028, 12, 12]} /><meshStandardMaterial color="#000" emissive="#5ee7ff" emissiveIntensity={6} toneMapped={false} /></mesh>
      ))}
    </group>
  );
}

function MiniArm({ active }: { active: boolean }) {
  const sh = useRef<THREE.Group>(null), el = useRef<THREE.Group>(null), base = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (active ? 1.4 : 0.7);
    if (base.current) base.current.rotation.y = Math.sin(t * 0.5) * 1.1;
    if (sh.current) sh.current.rotation.z = 0.9 + Math.sin(t) * 0.35;
    if (el.current) el.current.rotation.z = -1.6 + Math.sin(t + 1) * 0.45;
  });
  const orange = <meshPhysicalMaterial color="#e8742c" metalness={0.3} roughness={0.35} clearcoat={0.8} />;
  return (
    <group ref={base} position={[0, 0.62, 0]}>
      <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.12, 0.14, 0.12, 32]} /><meshPhysicalMaterial color="#1b2130" metalness={0.85} roughness={0.3} /></mesh>
      <group ref={sh} position={[0, 0.2, 0]}>
        <mesh position={[0.25, 0, 0]}><boxGeometry args={[0.5, 0.08, 0.09]} />{orange}</mesh>
        <group ref={el} position={[0.5, 0, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.05, 0.05, 0.12, 20]} /><meshPhysicalMaterial color="#1b2130" metalness={0.85} roughness={0.3} /></mesh>
          <mesh position={[0.2, 0, 0]}><boxGeometry args={[0.4, 0.06, 0.07]} />{orange}</mesh>
          <mesh position={[0.42, 0, 0]}><sphereGeometry args={[0.025, 12, 12]} /><meshStandardMaterial color="#000" emissive="#5ee7ff" emissiveIntensity={5} toneMapped={false} /></mesh>
        </group>
      </group>
    </group>
  );
}

function Pedestal({ s, hovered, onHover, onSelect, label }: { s: Station; hovered: boolean; onHover: (id: string | null) => void; onSelect: (s: Station) => void; label: { code: string; title: string; progress?: string } }) {
  const pos = stationPos(s.angle);
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => { if (ring.current) ring.current.emissiveIntensity += ((hovered ? 4 : 1.2) - ring.current.emissiveIntensity) * Math.min(1, dt * 6); });
  return (
    <group position={pos} rotation={[0, -s.angle, 0]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(s.id); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = ""; }}
      onClick={(e) => { e.stopPropagation(); onSelect(s); }}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow><cylinderGeometry args={[0.95, 1.05, 0.5, 72]} /><meshPhysicalMaterial color="#0c1220" metalness={0.85} roughness={0.28} clearcoat={0.6} /></mesh>
      <mesh position={[0, 0.505, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.86, 0.92, 96]} /><meshStandardMaterial ref={ring} color="#000" emissive={s.color} emissiveIntensity={1.2} toneMapped={false} /></mesh>
      <mesh position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.86, 64]} /><meshStandardMaterial color="#070b14" metalness={0.6} roughness={0.5} /></mesh>
      <Float speed={1.4} rotationIntensity={0} floatIntensity={hovered ? 0.35 : 0.15} floatingRange={[0, 0.06]}>
        {s.kind === "anatomy" && <HoloHuman color={s.color} active={hovered} />}
        {s.kind === "network" && <MiniNetwork color={s.color} active={hovered} />}
        {s.kind === "robot" && <MiniArm active={hovered} />}
      </Float>
      {/* columna de luz */}
      <mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.9, 0.9, 2.2, 48, 1, true]} /><meshBasicMaterial color={s.color} transparent opacity={hovered ? 0.035 : 0.0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
      <Html position={[0, 0.05, 1.12]} center zIndexRange={[5, 0]}>
        <div className="xp-label3d" style={{ borderColor: hovered ? s.color : undefined, padding: "5px 10px" }}>
          <small style={{ color: s.color }}>{label.code}</small>{label.title}{label.progress && <small style={{ color: "#7f8ca8" }}>{label.progress}</small>}
        </div>
      </Html>
    </group>
  );
}

function MonolithMesh({ m, onSelect }: { m: Monolith; onSelect: (m: Monolith) => void }) {
  const p = new THREE.Vector3(Math.sin(m.angle) * 8.5, 0, -Math.cos(m.angle) * 8.5 + 2.2);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  return (
    <group position={p} rotation={[0, -m.angle, 0]}
      onPointerOver={(e) => { e.stopPropagation(); if (mat.current) mat.current.emissiveIntensity = 3; document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { if (mat.current) mat.current.emissiveIntensity = 0.9; document.body.style.cursor = ""; }}
      onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
      <mesh position={[0, 1.3, 0]} castShadow><boxGeometry args={[0.7, 2.6, 0.18]} /><meshPhysicalMaterial color="#0b1019" metalness={0.9} roughness={0.25} clearcoat={0.8} /></mesh>
      <mesh position={[0, 1.3, 0.092]}><planeGeometry args={[0.04, 2.2]} /><meshStandardMaterial ref={mat} color="#000" emissive={m.color} emissiveIntensity={0.9} toneMapped={false} /></mesh>
      <Html position={[0, 0.15, 0.3]} center zIndexRange={[5, 0]}><div className="xp-label3d" style={{ opacity: 0.8 }}>{m.label}</div></Html>
    </group>
  );
}

/** Rig de cámara: deriva suave + vuelo hacia la estación elegida. */
function Rig({ flyTo, hovered, stations }: { flyTo: THREE.Vector3 | null; hovered: string | null; stations: Station[] }) {
  const { camera, pointer } = useThree();
  const look = useRef(new THREE.Vector3(0, 0.9, 0));
  useFrame(({ clock }, dt) => {
    const k = 1 - Math.exp(-dt * (flyTo ? 3.2 : 1.6));
    let goal: THREE.Vector3, tgt: THREE.Vector3;
    if (flyTo) {
      const toCenter = new THREE.Vector3(0, 0, 2.2).sub(flyTo).setY(0).normalize();
      goal = flyTo.clone().add(toCenter.multiplyScalar(2.0)).setY(1.45);
      tgt = flyTo.clone().setY(1.0);
    }
    else {
      const h = stations.find((s) => s.id === hovered);
      const t = clock.elapsedTime * 0.05;
      goal = new THREE.Vector3(-0.8 + Math.sin(t) * 0.5 + pointer.x * 0.4, 2.9 + pointer.y * 0.3, 9.8);
      tgt = h ? stationPos(h.angle).setY(0.9).multiplyScalar(0.5).add(new THREE.Vector3(-0.6, 0, 0)) : new THREE.Vector3(-0.9, 0.8, 0);
    }
    camera.position.lerp(goal, k);
    look.current.lerp(tgt, k);
    camera.lookAt(look.current);
  });
  return null;
}

export default function Observatory({ stations, monoliths, labels, hovered, onHover, onSelect, onSelectMonolith, flyTo }: {
  stations: Station[]; monoliths: Monolith[]; labels: Record<string, { code: string; title: string; progress?: string }>;
  hovered: string | null; onHover: (id: string | null) => void; onSelect: (s: Station) => void; onSelectMonolith: (m: Monolith) => void; flyTo: THREE.Vector3 | null;
}) {
  return (
    <>
      <Rig flyTo={flyTo} hovered={hovered} stations={stations} />
      <hemisphereLight args={["#9fb8ff", "#120d06", 0.25]} />
      <spotLight position={[0, 9, 4]} angle={0.7} penumbra={1} intensity={60} castShadow color="#dfe8ff" />
      <pointLight position={[-6, 2, -3]} intensity={20} color="#5ee7ff" distance={14} />
      <pointLight position={[6, 2, -3]} intensity={16} color="#ffb547" distance={14} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[30, 96]} />
        <MeshReflectorMaterial blur={[300, 90]} resolution={512} mixBlur={1} mixStrength={18} roughness={0.85} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.3} color="#05070d" metalness={0.6} mirror={0.4} />
      </mesh>
      {[3.0, 5.6, 8.0].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 2.2]}><ringGeometry args={[r, r + 0.008, 160]} /><meshBasicMaterial color="#1c2a44" /></mesh>
      ))}
      <Sparkles count={70} scale={[16, 5, 12]} position={[0, 2.5, -1]} size={1.6} speed={0.25} opacity={0.5} color="#8fe9ff" />
      {stations.map((s) => <Pedestal key={s.id} s={s} hovered={hovered === s.id} onHover={onHover} onSelect={onSelect} label={labels[s.id]} />)}
      {monoliths.map((m) => <MonolithMesh key={m.id} m={m} onSelect={onSelectMonolith} />)}
    </>
  );
}
