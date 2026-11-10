/**
 * Motor de cinemática de brazo — port 1:1 de apps/api/engines/robotics/solver.py
 * (ley de cosenos + atan2, desacople posición/orientación para 3 eslabones),
 * verificado contra Python con tools/golden/run.mjs.
 *
 * Extensiones para el laboratorio 3D (todas cálculo cerrado, no animación):
 *  - `solveSpatial`: brazo de 4 GDL (base yaw + hombro + codo + muñeca) cuyo
 *    plano de trabajo gira con la base: yaw = atan2(z, x) y el mismo solver
 *    planar en (r, h). Es la descomposición estándar de un brazo antropomórfico.
 *  - `gravityTorques`: torque estático que la gravedad ejerce en cada
 *    articulación de cabeceo (τ = Σ m·g·brazo horizontal), con la carga en la
 *    pinza. Es estática de cuerpo rígido, no dinámica completa.
 *  - `forward`: cinemática directa espacial para verificar cada solución.
 */

export class KinematicsError extends Error {}

/** Límite de torque del motor del hombro (N·m). */
export const SHOULDER_LIMIT = 45;

export interface ArmScene {
  l1: number; l2: number; target_x: number; target_y: number;
  elbow: "up" | "down"; l3?: number | null; target_phi_deg?: number | null;
}

export interface PlanarResult {
  link_count: 2 | 3;
  theta1_deg: number; theta2_deg: number; theta3_deg?: number;
  joint1: { x: number; y: number }; joint2?: { x: number; y: number };
  end_effector: { x: number; y: number }; target: { x: number; y: number };
  target_phi_deg?: number;
  fk_verification_error: number; fk_orientation_error_deg?: number;
  workspace: { r_min: number; r_max: number };
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function validate(s: ArmScene): string[] {
  const errors: string[] = [];
  if (s.l1 <= 0 || s.l2 <= 0) errors.push("Las longitudes de los eslabones (l1, l2) deben ser > 0.");
  if (s.l3 != null && s.l3 <= 0) errors.push("La longitud del eslabón 3 (l3) debe ser > 0.");
  if (s.elbow !== "up" && s.elbow !== "down") errors.push("elbow debe ser 'up' o 'down'.");
  if (s.l3 != null && s.target_phi_deg == null) errors.push("Un brazo de 3 eslabones necesita target_phi_deg (orientación deseada del efector final): la posición sola no alcanza para 3 ángulos.");
  if (errors.length) return errors;
  let wx = s.target_x, wy = s.target_y;
  if (s.l3 != null) { const p = rad(s.target_phi_deg!); wx -= s.l3 * Math.cos(p); wy -= s.l3 * Math.sin(p); }
  const r = Math.hypot(wx, wy), rMin = Math.abs(s.l1 - s.l2), rMax = s.l1 + s.l2;
  if (!(rMin - 1e-9 <= r && r <= rMax + 1e-9)) {
    const where = s.l3 != null ? "del punto de muñeca (objetivo menos la contribución del eslabón 3)" : "del objetivo";
    errors.push(`La distancia ${where} está fuera del espacio de trabajo de l1+l2: distancia=${r.toFixed(4)}, alcance válido=[${rMin.toFixed(4)}, ${rMax.toFixed(4)}].`);
  }
  return errors;
}

function solve2(l1: number, l2: number, x: number, y: number, elbow: "up" | "down"): [number, number] {
  const r = Math.hypot(x, y);
  const c = Math.max(-1, Math.min(1, (r * r - l1 * l1 - l2 * l2) / (2 * l1 * l2)));
  const t2 = elbow === "up" ? Math.acos(c) : -Math.acos(c);
  const t1 = Math.atan2(y, x) - Math.atan2(l2 * Math.sin(t2), l1 + l2 * Math.cos(t2));
  return [t1, t2];
}

export function solveArm(s: ArmScene): PlanarResult {
  const errors = validate(s);
  if (errors.length) throw new KinematicsError(errors.join("; "));
  const x = s.target_x, y = s.target_y;
  const workspace = { r_min: Math.abs(s.l1 - s.l2), r_max: s.l1 + s.l2 };
  if (s.l3 == null) {
    const [t1, t2] = solve2(s.l1, s.l2, x, y, s.elbow);
    const j1 = { x: s.l1 * Math.cos(t1), y: s.l1 * Math.sin(t1) };
    const ee = { x: j1.x + s.l2 * Math.cos(t1 + t2), y: j1.y + s.l2 * Math.sin(t1 + t2) };
    return { link_count: 2, theta1_deg: deg(t1), theta2_deg: deg(t2), joint1: j1, end_effector: ee, target: { x, y }, fk_verification_error: Math.hypot(ee.x - x, ee.y - y), workspace };
  }
  const phi = rad(s.target_phi_deg!), l3 = s.l3;
  const [t1, t2] = solve2(s.l1, s.l2, x - l3 * Math.cos(phi), y - l3 * Math.sin(phi), s.elbow);
  const t3 = phi - t1 - t2;
  const j1 = { x: s.l1 * Math.cos(t1), y: s.l1 * Math.sin(t1) };
  const j2 = { x: j1.x + s.l2 * Math.cos(t1 + t2), y: j1.y + s.l2 * Math.sin(t1 + t2) };
  const ee = { x: j2.x + l3 * Math.cos(t1 + t2 + t3), y: j2.y + l3 * Math.sin(t1 + t2 + t3) };
  const m = (a: number, n: number) => ((a % n) + n) % n;
  const phiErr = Math.abs(m(t1 + t2 + t3 - phi + Math.PI, 2 * Math.PI) - Math.PI);
  return {
    link_count: 3, theta1_deg: deg(t1), theta2_deg: deg(t2), theta3_deg: deg(t3), joint1: j1, joint2: j2, end_effector: ee,
    target: { x, y }, target_phi_deg: s.target_phi_deg!, fk_verification_error: Math.hypot(ee.x - x, ee.y - y),
    fk_orientation_error_deg: deg(phiErr), workspace,
  };
}

// ---------- brazo espacial de 4 GDL ----------
export interface ArmSpec {
  baseHeight: number; l1: number; l2: number; l3: number;   // metros
  m1: number; m2: number; m3: number;                         // kg (centro de masa a mitad de eslabón)
  maxSpeedDeg: number;                                        // velocidad máx. por articulación (°/s)
  limits: { shoulder: [number, number]; elbow: [number, number]; wrist: [number, number] };
}

export const DEFAULT_ARM: ArmSpec = {
  baseHeight: 0.32, l1: 0.55, l2: 0.45, l3: 0.16, m1: 2.4, m2: 1.6, m3: 0.5,
  maxSpeedDeg: 90,
  limits: { shoulder: [-10, 170], elbow: [-160, 160], wrist: [-135, 135] },
};

export interface JointState { yaw: number; shoulder: number; elbow: number; wrist: number; } // grados

export interface SpatialSolution {
  ok: boolean; reason?: string;
  joints?: JointState;
  wristPoint?: [number, number, number];
  fkError?: number;          // m
  reach: number;             // distancia radial del punto de muñeca al hombro
  limitViolations: string[];
}

/** Cinemática directa: devuelve las posiciones de hombro, codo, muñeca y pinza. */
export function forward(spec: ArmSpec, j: JointState) {
  const yaw = rad(j.yaw), a1 = rad(j.shoulder), a2 = a1 + rad(j.elbow), a3 = a2 + rad(j.wrist);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const toWorld = (r: number, h: number): [number, number, number] => [r * cy, spec.baseHeight + h, -r * sy];
  const r1 = spec.l1 * Math.cos(a1), h1 = spec.l1 * Math.sin(a1);
  const r2 = r1 + spec.l2 * Math.cos(a2), h2 = h1 + spec.l2 * Math.sin(a2);
  const r3 = r2 + spec.l3 * Math.cos(a3), h3 = h2 + spec.l3 * Math.sin(a3);
  return { shoulder: toWorld(0, 0), elbow: toWorld(r1, h1), wrist: toWorld(r2, h2), tool: toWorld(r3, h3), planar: { r1, h1, r2, h2, r3, h3 } };
}

/** IK espacial: objetivo de la pinza (x, y, z) con cabeceo deseado `pitchDeg`
 * (−90 = pinza apuntando hacia abajo, la postura de "pick"). */
export function solveSpatial(spec: ArmSpec, x: number, y: number, z: number, pitchDeg: number, elbow: "up" | "down"): SpatialSolution {
  const yaw = deg(Math.atan2(-z, x));
  const r = Math.hypot(x, z), h = y - spec.baseHeight;
  const scene: ArmScene = { l1: spec.l1, l2: spec.l2, l3: spec.l3, target_x: r, target_y: h, target_phi_deg: pitchDeg, elbow };
  const errs = validate(scene);
  const p = rad(pitchDeg);
  const reach = Math.hypot(r - spec.l3 * Math.cos(p), h - spec.l3 * Math.sin(p));
  if (errs.length) return { ok: false, reason: "Objetivo fuera del espacio de trabajo", reach, limitViolations: [] };
  const sol = solveArm(scene);
  const joints: JointState = { yaw, shoulder: sol.theta1_deg, elbow: sol.theta2_deg, wrist: sol.theta3_deg! };
  const v: string[] = [];
  const chk = (name: keyof ArmSpec["limits"], val: number, label: string) => {
    const [lo, hi] = spec.limits[name];
    if (val < lo - 1e-6 || val > hi + 1e-6) v.push(`${label} ${val.toFixed(1)}° fuera de [${lo}°, ${hi}°]`);
  };
  chk("shoulder", joints.shoulder, "Hombro"); chk("elbow", joints.elbow, "Codo"); chk("wrist", joints.wrist, "Muñeca");
  const fk = forward(spec, joints).tool;
  const fkError = Math.hypot(fk[0] - x, fk[1] - y, fk[2] - z);
  const wp = forward(spec, joints).wrist;
  return { ok: v.length === 0, reason: v.length ? "Límite articular" : undefined, joints, wristPoint: wp, fkError, reach, limitViolations: v };
}

/** Torques estáticos por gravedad (N·m) en hombro, codo y muñeca. */
export function gravityTorques(spec: ArmSpec, j: JointState, payloadKg: number, g = 9.81) {
  const { planar: P } = forward(spec, j);
  const a1 = rad(j.shoulder), a2 = a1 + rad(j.elbow), a3 = a2 + rad(j.wrist);
  const c1 = (spec.l1 / 2) * Math.cos(a1);
  const c2 = P.r1 + (spec.l2 / 2) * Math.cos(a2);
  const c3 = P.r2 + (spec.l3 / 2) * Math.cos(a3);
  const tool = P.r3;
  const shoulder = g * (spec.m1 * c1 + spec.m2 * c2 + spec.m3 * c3 + payloadKg * tool);
  const elbow = g * (spec.m2 * (c2 - P.r1) + spec.m3 * (c3 - P.r1) + payloadKg * (tool - P.r1));
  const wrist = g * (spec.m3 * (c3 - P.r2) + payloadKg * (tool - P.r2));
  return { shoulder, elbow, wrist };
}

/** Avanza las articulaciones hacia el objetivo con velocidad máxima
 * sincronizada: todas llegan a la vez (interpolación en espacio articular). */
export function stepJoints(cur: JointState, goal: JointState, maxSpeedDeg: number, dt: number): { next: JointState; done: boolean } {
  const keys: (keyof JointState)[] = ["yaw", "shoulder", "elbow", "wrist"];
  const delta = keys.map((k) => {
    let d = goal[k] - cur[k];
    if (k === "yaw") d = ((d + 540) % 360) - 180;
    return d;
  });
  const maxD = Math.max(...delta.map(Math.abs));
  if (maxD < 1e-3) return { next: { ...goal }, done: true };
  const f = Math.min(1, (maxSpeedDeg * dt) / maxD);
  const next = { ...cur };
  keys.forEach((k, i) => { next[k] = cur[k] + delta[i] * f; });
  return { next, done: f >= 1 };
}
