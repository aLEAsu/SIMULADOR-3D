"use client";

/**
 * Celda robótica 3D con física Rapier (WASM, Apache-2.0).
 *
 * Qué es cálculo y qué es motor físico:
 *  - Ángulos articulares: IK cerrada (lib/engines/robotics.ts) + interpolación
 *    articular sincronizada a velocidad máxima.
 *  - Torques: estática de cuerpo rígido por gravedad (mismo módulo).
 *    Si un movimiento con carga exige más torque que el límite del motor del
 *    hombro, el movimiento se detiene (saturación) — no se anima lo imposible.
 *  - Cubos, mesa, contactos, empujes y caídas: Rapier. Los eslabones son
 *    cuerpos cinemáticos que siguen la cinemática directa y empujan cubos.
 *  - Agarre: restricción (el cubo pasa a cinemático solidario a la pinza),
 *    no fricción de contacto de dedos; se declara en la ficha de fidelidad.
 */
import { MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { CuboidCollider, Physics, RapierRigidBody, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { ArmSpec, JointState, SHOULDER_LIMIT, forward, gravityTorques, solveSpatial, stepJoints } from "../lib/engines/robotics";
export { SHOULDER_LIMIT };

const GRIP_RADIUS = 0.07;

export interface CubeSpec { id: string; size: number; mass: number; pos: [number, number, number]; color: string; label: string; }
export interface Beacon { id: string; pos: [number, number, number]; reachable: boolean; }
export interface Zone { center: [number, number]; size: [number, number]; }

export interface Telemetry {
  joints: JointState; tool: [number, number, number]; torques: { shoulder: number; elbow: number; wrist: number };
  payload: number; held: string | null; stalled: boolean; moving: boolean;
  cubes: Record<string, { pos: [number, number, number]; speed: number }>;
}

export interface SimControl {
  goal: JointState | null;
  grip: boolean;
  /** set by sim: */
  joints: JointState;
  events: { type: "grasp" | "grasp-refused" | "release" | "stall"; detail: string; torque?: number }[];
}

interface Props {
  spec: ArmSpec;
  control: MutableRefObject<SimControl>;
  cubes: CubeSpec[];
  cubesKey: number;
  beacons: Beacon[];
  zone: Zone | null;
  lens: boolean;
  target: [number, number, number] | null;
  ghost: JointState | null;
  onTelemetry: (t: Telemetry) => void;
  onPickPoint: (p: [number, number, number], cubeId?: string) => void;
  onBeacon?: (id: string) => void;
}

const rad = THREE.MathUtils.degToRad;
const V = new THREE.Vector3(), Q = new THREE.Quaternion();

/** Geometría visual del brazo; expone anclas para cuerpos cinemáticos. */
function ArmVisual({ spec, jointsRef, gripRef, anchors, ghost = false, ghostJoints }: {
  spec: ArmSpec; jointsRef?: MutableRefObject<JointState>; gripRef?: MutableRefObject<number>;
  anchors?: MutableRefObject<Record<string, THREE.Object3D | null>>; ghost?: boolean; ghostJoints?: JointState | null;
}) {
  const yawG = useRef<THREE.Group>(null), shG = useRef<THREE.Group>(null), elG = useRef<THREE.Group>(null), wrG = useRef<THREE.Group>(null);
  const fL = useRef<THREE.Group>(null), fR = useRef<THREE.Group>(null);
  useFrame(() => {
    const j = ghost ? ghostJoints : jointsRef?.current;
    if (!j || !yawG.current) return;
    yawG.current.rotation.y = rad(j.yaw);
    shG.current!.rotation.z = rad(j.shoulder);
    elG.current!.rotation.z = rad(j.elbow);
    wrG.current!.rotation.z = rad(j.wrist);
    const g = gripRef?.current ?? 0.06;
    if (fL.current && fR.current) { fL.current.position.z = g; fR.current.position.z = -g; }
  });
  const reg = (k: string) => (o: THREE.Object3D | null) => { if (anchors) anchors.current[k] = o; };
  const M = ghost
    ? (c: string) => <meshStandardMaterial color={c} transparent opacity={0.16} depthWrite={false} emissive="#5ee7ff" emissiveIntensity={0.6} />
    : (c: string, m = 0.7, r = 0.3) => <meshPhysicalMaterial color={c} metalness={m} roughness={r} clearcoat={0.7} clearcoatRoughness={0.25} />;
  const orange = "#e8742c", dark = "#1b2130", steel = "#8e9bb3";
  return (
    <group ref={yawG}>
      {/* torreta giratoria */}
      <mesh position={[0, 0.13, 0]} castShadow={!ghost}><cylinderGeometry args={[0.13, 0.15, 0.12, 48]} />{M(dark, 0.8, 0.35)}</mesh>
      <mesh position={[0, 0.24, 0]} castShadow={!ghost}><boxGeometry args={[0.16, 0.14, 0.2]} />{M(orange, 0.3, 0.4)}</mesh>
      <group ref={shG} position={[0, spec.baseHeight, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={!ghost}><cylinderGeometry args={[0.085, 0.085, 0.22, 40]} />{M(dark, 0.85, 0.3)}</mesh>
        <RoundedBox args={[spec.l1, 0.1, 0.12]} radius={0.04} position={[spec.l1 / 2, 0, 0]} castShadow={!ghost}>{M(orange, 0.3, 0.38)}</RoundedBox>
        <object3D ref={reg("l1")} position={[spec.l1 / 2, 0, 0]} />
        <group ref={elG} position={[spec.l1, 0, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={!ghost}><cylinderGeometry args={[0.065, 0.065, 0.17, 36]} />{M(dark, 0.85, 0.3)}</mesh>
          <RoundedBox args={[spec.l2, 0.075, 0.09]} radius={0.03} position={[spec.l2 / 2, 0, 0]} castShadow={!ghost}>{M(orange, 0.3, 0.38)}</RoundedBox>
          <object3D ref={reg("l2")} position={[spec.l2 / 2, 0, 0]} />
          <group ref={wrG} position={[spec.l2, 0, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={!ghost}><cylinderGeometry args={[0.045, 0.045, 0.11, 32]} />{M(dark, 0.85, 0.3)}</mesh>
            <mesh position={[0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow={!ghost}><cylinderGeometry args={[0.035, 0.04, 0.07, 32]} />{M(steel, 0.9, 0.25)}</mesh>
            <mesh position={[0.1, 0, 0]} castShadow={!ghost}><boxGeometry args={[0.02, 0.05, 0.17]} />{M(steel, 0.9, 0.25)}</mesh>
            {/* dedos paralelos */}
            <group ref={fL} position={[0, 0, 0.06]}>
              <mesh position={[spec.l3 - 0.015, 0, 0]} castShadow={!ghost}><boxGeometry args={[0.1, 0.035, 0.012]} />{M(dark, 0.7, 0.4)}</mesh>
              <object3D ref={reg("fL")} position={[spec.l3 - 0.015, 0, 0]} />
            </group>
            <group ref={fR} position={[0, 0, -0.06]}>
              <mesh position={[spec.l3 - 0.015, 0, 0]} castShadow={!ghost}><boxGeometry args={[0.1, 0.035, 0.012]} />{M(dark, 0.7, 0.4)}</mesh>
              <object3D ref={reg("fR")} position={[spec.l3 - 0.015, 0, 0]} />
            </group>
            <object3D ref={reg("tool")} position={[spec.l3, 0, 0]} />
            {!ghost && (
              <mesh position={[spec.l3, 0, 0]}><sphereGeometry args={[0.008, 12, 12]} /><meshStandardMaterial color="#000" emissive="#5ee7ff" emissiveIntensity={4} toneMapped={false} /></mesh>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}

/** Cuerpo cinemático que copia la pose mundial de un ancla visual. */
function KinematicFollower({ anchorKey, anchors, half }: { anchorKey: string; anchors: MutableRefObject<Record<string, THREE.Object3D | null>>; half: [number, number, number] }) {
  const body = useRef<RapierRigidBody>(null);
  useFrame(() => {
    const a = anchors.current[anchorKey];
    if (!a || !body.current) return;
    a.getWorldPosition(V); a.getWorldQuaternion(Q);
    body.current.setNextKinematicTranslation(V);
    body.current.setNextKinematicRotation(Q);
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -5, 0]}>
      <CuboidCollider args={half} friction={0.9} />
    </RigidBody>
  );
}

function Cube({ spec, bodies, onPick }: { spec: CubeSpec; bodies: MutableRefObject<Record<string, RapierRigidBody | null>>; onPick: (e: ThreeEvent<MouseEvent>) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <RigidBody ref={(b) => { bodies.current[spec.id] = b; }} type="dynamic" colliders={false} position={spec.pos} canSleep>
      <CuboidCollider args={[spec.size / 2, spec.size / 2, spec.size / 2]} mass={spec.mass} friction={0.8} restitution={0.05} />
      <RoundedBox args={[spec.size, spec.size, spec.size]} radius={spec.size * 0.08} castShadow receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
        onClick={onPick}>
        <meshPhysicalMaterial color={spec.color} roughness={0.35} metalness={0.1} clearcoat={0.6} emissive={spec.color} emissiveIntensity={hover ? 0.5 : 0.05} />
      </RoundedBox>
    </RigidBody>
  );
}

function Controller({ spec, control, bodies, cubes, anchors, gripRef, jointsRef, onTelemetry }: {
  spec: ArmSpec; control: MutableRefObject<SimControl>; bodies: MutableRefObject<Record<string, RapierRigidBody | null>>;
  cubes: CubeSpec[]; anchors: MutableRefObject<Record<string, THREE.Object3D | null>>; gripRef: MutableRefObject<number>;
  jointsRef: MutableRefObject<JointState>; onTelemetry: (t: Telemetry) => void;
}) {
  const held = useRef<{ id: string; offset: THREE.Matrix4 } | null>(null);
  const prevGrip = useRef(false);
  const pending = useRef(false); // pinza cerrada y vacía, esperando que un cubo entre entre los dedos
  const stalled = useRef(false);
  const lastTel = useRef(0);
  const massOf = (id: string | null) => cubes.find((c) => c.id === id)?.mass ?? 0;

  useFrame((state, dtRaw) => {
    // Tiempo real (con tope): en equipos lentos el brazo no debe ir en cámara lenta.
    const dt = Math.min(dtRaw, 0.25);
    const c = control.current;
    const payload = massOf(held.current?.id ?? null);
    let moving = false;
    // --- movimiento articular con saturación de torque ---
    if (c.goal) {
      const { next, done } = stepJoints(jointsRef.current, c.goal, spec.maxSpeedDeg, dt);
      const tNext = Math.abs(gravityTorques(spec, next, payload).shoulder);
      const tCur = Math.abs(gravityTorques(spec, jointsRef.current, payload).shoulder);
      if (tNext > SHOULDER_LIMIT && tNext >= tCur - 1e-9) {
        if (!stalled.current) { stalled.current = true; c.events.push({ type: "stall", detail: "Saturación del hombro", torque: tNext }); }
      } else {
        stalled.current = false;
        jointsRef.current = next; moving = !done;
        if (done) c.goal = null;
      }
    }
    c.joints = jointsRef.current;

    // --- pinza ---
    const tool = anchors.current.tool;
    // Intenta sujetar el cubo más cercano entre los dedos. `radius` es la
    // tolerancia: amplia al pulsar "cerrar"; estricta mientras la pinza
    // cerrada y vacía sigue bajando (así un cierre anticipado no aplasta el
    // cubo contra la mesa: lo toma en cuanto entra entre los dedos).
    const tryGrasp = (radius: number): "grasp" | "refused" | "none" => {
      if (!tool) return "none";
      tool.getWorldPosition(V);
      let best: string | null = null, bd = radius;
      for (const cb of cubes) {
        const b = bodies.current[cb.id]; if (!b) continue;
        const p = b.translation(); const d = V.distanceTo(new THREE.Vector3(p.x, p.y, p.z));
        if (d < bd + cb.size / 2) { bd = d; best = cb.id; }
      }
      if (!best) return "none";
      const tq = Math.abs(gravityTorques(spec, jointsRef.current, massOf(best)).shoulder);
      if (tq > SHOULDER_LIMIT) { c.events.push({ type: "grasp-refused", detail: best, torque: tq }); return "refused"; }
      const b = bodies.current[best]!;
      const p = b.translation(), r = b.rotation();
      const cubeM = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(r.x, r.y, r.z, r.w), new THREE.Vector3(1, 1, 1));
      held.current = { id: best, offset: tool.matrixWorld.clone().invert().multiply(cubeM) };
      b.setBodyType(2 as never, true); // KinematicPositionBased
      c.events.push({ type: "grasp", detail: best, torque: tq });
      return "grasp";
    };
    if (c.grip && !held.current && pending.current && tool) {
      if (tryGrasp(0.045) !== "none") pending.current = false;
    }
    if (c.grip !== prevGrip.current && tool) {
      prevGrip.current = c.grip;
      if (c.grip) {
        pending.current = tryGrasp(GRIP_RADIUS) === "none";
      } else if (held.current) {
        pending.current = false;
        const b = bodies.current[held.current.id];
        if (b) { b.setBodyType(0 as never, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true); }
        c.events.push({ type: "release", detail: held.current.id });
        held.current = null;
      }
    }
    // dedos: abren/cierran hasta el cubo
    const heldSize = cubes.find((cb) => cb.id === held.current?.id)?.size;
    const goalGap = c.grip ? (heldSize ? heldSize / 2 + 0.006 : 0.012) : 0.075;
    gripRef.current += (goalGap - gripRef.current) * Math.min(1, dt * 12);

    // cubo sujeto sigue a la pinza
    if (held.current && tool) {
      const b = bodies.current[held.current.id];
      if (b) {
        const m = tool.matrixWorld.clone().multiply(held.current.offset);
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        m.decompose(pos, q, s);
        b.setNextKinematicTranslation(pos); b.setNextKinematicRotation(q);
      }
    }

    // --- telemetría (10 Hz) ---
    if (state.clock.elapsedTime - lastTel.current > 0.1) {
      lastTel.current = state.clock.elapsedTime;
      const fk = forward(spec, jointsRef.current).tool;
      const cubesT: Telemetry["cubes"] = {};
      for (const cb of cubes) {
        const b = bodies.current[cb.id]; if (!b) continue;
        const p = b.translation(), v = b.linvel();
        cubesT[cb.id] = { pos: [p.x, p.y, p.z], speed: Math.hypot(v.x, v.y, v.z) };
      }
      onTelemetry({ joints: { ...jointsRef.current }, tool: fk, torques: gravityTorques(spec, jointsRef.current, payload), payload, held: held.current?.id ?? null, stalled: stalled.current, moving, cubes: cubesT });
    }
  });
  return null;
}

export default function RobotSim({ spec, control, cubes, cubesKey, beacons, zone, lens, target, ghost, onTelemetry, onPickPoint, onBeacon }: Props) {
  const anchors = useRef<Record<string, THREE.Object3D | null>>({});
  const bodies = useRef<Record<string, RapierRigidBody | null>>({});
  const jointsRef = useRef<JointState>(control.current.joints);
  const gripRef = useRef(0.075);
  useEffect(() => { jointsRef.current = control.current.joints; }, [control]);

  // Alcance sobre la mesa con pinza vertical (pitch −90°) para agarrar a 3 cm:
  // la muñeca queda l3 por encima del punto de agarre ⇒ r = √((l1+l2)² − Δh²).
  const shell = useMemo(() => {
    const outer = spec.l1 + spec.l2, dh = spec.baseHeight - (0.03 + spec.l3);
    return { outer, inner: Math.abs(spec.l1 - spec.l2), tableReach: Math.sqrt(Math.max(outer ** 2 - dh ** 2, 0)) };
  }, [spec]);

  return (
    <>
      <OrbitControls makeDefault target={[0.25, 0.35, 0]} maxPolarAngle={1.45} minDistance={0.9} maxDistance={5} enableDamping />
      <hemisphereLight args={["#a9c2ff", "#1a1006", 0.35]} />
      <directionalLight position={[2.5, 4, 2]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-2} shadow-camera-right={2} shadow-camera-top={2} shadow-camera-bottom={-2} shadow-bias={-0.0004} />
      <spotLight position={[-2.5, 3, -2]} angle={0.6} penumbra={1} intensity={18} color="#5ee7ff" />
      <spotLight position={[2, 2.2, -2.5]} angle={0.5} penumbra={1} intensity={10} color="#ffb547" />

      <Physics gravity={[0, -9.81, 0]}>
        {/* mesa de trabajo */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[1.6, 0.05, 1.6]} position={[0, -0.05, 0]} friction={0.7} />
          <mesh position={[0, -0.05, 0]} receiveShadow
            onClick={(e) => { e.stopPropagation(); onPickPoint([e.point.x, 0, e.point.z]); }}>
            <boxGeometry args={[3.2, 0.1, 3.2]} />
            <meshStandardMaterial color="#0c111c" metalness={0.35} roughness={0.82} />
          </mesh>
        </RigidBody>

        <KinematicFollower anchorKey="l1" anchors={anchors} half={[spec.l1 / 2 - 0.06, 0.05, 0.06]} />
        <KinematicFollower anchorKey="l2" anchors={anchors} half={[spec.l2 / 2 - 0.05, 0.035, 0.045]} />
        <KinematicFollower anchorKey="fL" anchors={anchors} half={[0.05, 0.017, 0.006]} />
        <KinematicFollower anchorKey="fR" anchors={anchors} half={[0.05, 0.017, 0.006]} />

        <group key={cubesKey}>
          {cubes.map((c) => (
            <Cube key={c.id} spec={c} bodies={bodies} onPick={(e) => {
              e.stopPropagation();
              const b = bodies.current[c.id]; const p = b?.translation();
              if (p) onPickPoint([p.x, p.y, p.z], c.id);
            }} />
          ))}
        </group>
        <Controller spec={spec} control={control} bodies={bodies} cubes={cubes} anchors={anchors} gripRef={gripRef} jointsRef={jointsRef} onTelemetry={onTelemetry} />
      </Physics>

      {/* rejilla técnica sobre la mesa */}
      <gridHelper args={[3.2, 32, "#1d2840", "#121a2b"]} position={[0, 0.001, 0]} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={4} blur={2.2} far={1.2} />

      {/* pedestal fijo */}
      <mesh position={[0, 0.035, 0]} castShadow receiveShadow><cylinderGeometry args={[0.2, 0.22, 0.07, 56]} /><meshPhysicalMaterial color="#141a26" metalness={0.85} roughness={0.3} /></mesh>
      <mesh position={[0, 0.072, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.19, 0.2, 64]} /><meshStandardMaterial color="#000" emissive="#ffb547" emissiveIntensity={2} toneMapped={false} /></mesh>

      <ArmVisual spec={spec} jointsRef={jointsRef} gripRef={gripRef} anchors={anchors} />
      {lens && ghost && <ArmVisual spec={spec} ghost ghostJoints={ghost} />}

      {/* zona de entrega */}
      {zone && (
        <group position={[zone.center[0], 0.003, zone.center[1]]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={zone.size} /><meshBasicMaterial color="#5df2a5" transparent opacity={0.08} depthWrite={false} /></mesh>
          <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(zone.size[0], zone.size[1])]} />
            <lineBasicMaterial color="#5df2a5" />
          </lineSegments>
          <Html position={[0, 0.01, zone.size[1] / 2 + 0.06]} center zIndexRange={[5, 0]}><div className="xp-label3d" style={{ color: "#5df2a5", borderColor: "#5df2a5" }}>ZONA DE ENTREGA</div></Html>
        </group>
      )}

      {/* balizas */}
      {beacons.map((b) => (
        <group key={b.id} position={b.pos}
          onClick={(e) => { e.stopPropagation(); onBeacon?.(b.id); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { document.body.style.cursor = ""; }}>
          <mesh><sphereGeometry args={[0.025, 24, 24]} /><meshStandardMaterial color="#000" emissive={lens ? (b.reachable ? "#5df2a5" : "#ff5d6c") : "#ffb547"} emissiveIntensity={3.5} toneMapped={false} /></mesh>
          <mesh><sphereGeometry args={[0.05, 24, 24]} /><meshBasicMaterial color={lens ? (b.reachable ? "#5df2a5" : "#ff5d6c") : "#ffb547"} transparent opacity={0.12} depthWrite={false} /></mesh>
          <mesh position={[0, -b.pos[1] / 2, 0]}><cylinderGeometry args={[0.002, 0.002, b.pos[1], 6]} /><meshBasicMaterial color="#ffb547" transparent opacity={0.25} /></mesh>
          <Html position={[0, 0.09, 0]} center zIndexRange={[5, 0]}><div className="xp-label3d">BALIZA {b.id}</div></Html>
        </group>
      ))}

      {/* objetivo actual */}
      {target && (
        <group position={target}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.035, 0.042, 48]} /><meshStandardMaterial color="#000" emissive="#5ee7ff" emissiveIntensity={3} toneMapped={false} side={THREE.DoubleSide} /></mesh>
          <mesh position={[0, -target[1] / 2, 0]}><cylinderGeometry args={[0.0015, 0.0015, target[1], 6]} /><meshBasicMaterial color="#5ee7ff" transparent opacity={0.5} /></mesh>
        </group>
      )}

      {/* envolvente de trabajo de la muñeca (lente) */}
      {lens && (
        <group position={[0, spec.baseHeight, 0]}>
          <mesh><sphereGeometry args={[shell.outer, 48, 32]} /><meshBasicMaterial color="#5ee7ff" transparent opacity={0.045} depthWrite={false} side={THREE.DoubleSide} /></mesh>
          <mesh><sphereGeometry args={[shell.outer, 32, 16]} /><meshBasicMaterial color="#5ee7ff" wireframe transparent opacity={0.08} /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -spec.baseHeight + 0.004, 0]}>
            <ringGeometry args={[shell.tableReach - 0.005, shell.tableReach, 128]} />
            <meshStandardMaterial color="#000" emissive="#5ee7ff" emissiveIntensity={2} toneMapped={false} />
          </mesh>
          <Html position={[0, shell.outer + 0.05, 0]} center zIndexRange={[5, 0]}><div className="xp-label3d" style={{ color: "#5ee7ff", borderColor: "#5ee7ff" }}>ENVOLVENTE DE MUÑECA · r = l1 + l2 = {shell.outer.toFixed(2)} m · alcance en mesa {shell.tableReach.toFixed(2)} m</div></Html>
        </group>
      )}
    </>
  );
}

export { solveSpatial };
