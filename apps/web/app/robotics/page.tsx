"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Crosshair, Grip, Hand, Home, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Journal, logJournal, PhaseTrack, Phase, Predict, TopBar, Toast, useToast } from "../xp/Shell";
import { DEFAULT_ARM, JointState, SHOULDER_LIMIT, forward, gravityTorques, solveSpatial } from "../lib/engines/robotics";
import type { Beacon, CubeSpec, SimControl, Telemetry, Zone } from "./RobotSim";

const Stage = dynamic(() => import("../xp/Stage"), { ssr: false });
const RobotSim = dynamic(() => import("./RobotSim"), { ssr: false });

const spec = DEFAULT_ARM;
const HOME: JointState = { yaw: 0, shoulder: 70, elbow: -110, wrist: -50 };

const FIDELITY = {
  level: "Cinemática exacta + física Rapier",
  computes: [
    "IK cerrada de 4 GDL (base + plano vertical con desacople de muñeca), verificada por FK (error ~1e-16 m).",
    "Torque estático por gravedad en hombro, codo y muñeca con la carga real sujeta.",
    "Saturación: el hombro no supera 45 N·m; un movimiento que lo exija se detiene.",
    "Cubos, mesa, empujes, caídas y apilado: motor de cuerpo rígido Rapier (WASM).",
  ],
  omits: ["Dinámica del brazo (inercias, Coriolis): las articulaciones siguen un perfil de velocidad, no un par.", "Fricción de contacto de los dedos: el agarre es una restricción rígida.", "Flexión de eslabones, holguras y backlash."],
  source: "IK portada del solver Python del proyecto y verificada contra él; Rapier © Dimforge, Apache-2.0.",
};

interface Mission {
  id: string; code: string; title: string; brief: string[];
  cubes: CubeSpec[]; beacons: [number, number, number][]; zone: Zone | null;
  predict: { question: string; choices: { id: string; label: string }[]; multi?: boolean } | null;
  objectives: { id: string; text: string }[];
  hint: string; explain: string[];
}

/** Alcanzable si alguna orientación de pinza (−90°…+90°) da IK válida dentro de límites. */
function reachable(p: [number, number, number]) {
  for (let pitch = -90; pitch <= 90; pitch += 5) for (const e of ["up", "down"] as const) if (solveSpatial(spec, p[0], p[1], p[2], pitch, e).ok) return { pitch, elbow: e };
  return null;
}

const MISSIONS: Mission[] = [
  {
    id: "r1", code: "01", title: "Envolvente de trabajo",
    brief: ["Cuatro balizas flotan en la celda. Antes de mover el brazo, marca cuáles crees que puede tocar la pinza.", "El alcance no depende solo de la distancia: también de la orientación de la pinza y de los límites de cada articulación."],
    cubes: [], beacons: [[0.62, 0.42, 0.25], [0.15, 0.95, -0.35], [1.22, 0.25, 0.1], [-0.25, 1.5, 0.05]], zone: null,
    predict: { question: "¿Qué balizas son alcanzables? (elige todas las que creas)", choices: [{ id: "A", label: "A" }, { id: "B", label: "B" }, { id: "C", label: "C" }, { id: "D", label: "D" }], multi: true },
    objectives: [{ id: "touch", text: "Toca con la pinza cada baliza alcanzable (clic en la baliza o en la mesa)." }],
    hint: "Haz clic sobre una baliza: el solver buscará una orientación válida. Si no existe, te dirá por qué.",
    explain: ["La muñeca solo puede estar a una distancia del hombro entre |l1−l2| y l1+l2 (ley de cosenos). La pinza añade l3 en la dirección de su orientación, así que el volumen alcanzable por la punta es esa esfera 'engordada' por l3 — recortada por los límites articulares y la mesa."],
  },
  {
    id: "r2", code: "02", title: "Pick & place",
    brief: ["Lleva el cubo naranja (0,5 kg) a la zona de entrega.", "Secuencia típica: posicionar encima → bajar → cerrar pinza → subir → trasladar → bajar → abrir."],
    cubes: [{ id: "c1", size: 0.06, mass: 0.5, pos: [0.62, 0.03, 0.28], color: "#ff8a3d", label: "Cubo 0,5 kg" }],
    beacons: [], zone: { center: [0.15, -0.6], size: [0.24, 0.24] },
    predict: { question: "Al cerrar la pinza sobre el cubo, ¿qué pasa con el torque del hombro?", choices: [{ id: "up", label: "Aumenta" }, { id: "same", label: "No cambia" }, { id: "down", label: "Disminuye" }] },
    objectives: [{ id: "grasp", text: "Sujeta el cubo con la pinza." }, { id: "deliver", text: "Déjalo en reposo dentro de la zona verde." }],
    hint: "Clic en el cubo = el brazo se coloca encima. Usa Bajar, Cerrar, Subir. Después clic en la zona y Bajar/Abrir.",
    explain: ["La carga añade m·g·d al torque del hombro, con d la distancia horizontal entre el eje del hombro y la pinza. Por eso un mismo cubo 'pesa' más para el motor cuanto más lejos lo sostengas."],
  },
  {
    id: "r3", code: "03", title: "Carga límite",
    brief: ["Un bloque de 4 kg está al borde de la mesa. El motor del hombro entrega como máximo 45 N·m.", "Llévalo a la zona de entrega junto a la base."],
    cubes: [{ id: "h1", size: 0.09, mass: 4, pos: [0.93, 0.045, -0.12], color: "#c44dff", label: "Bloque 4 kg" }],
    beacons: [], zone: { center: [0.38, 0.12], size: [0.26, 0.26] },
    predict: { question: "¿Podrá el brazo levantar el bloque de 4 kg desde donde está ahora?", choices: [{ id: "si", label: "Sí" }, { id: "no", label: "No" }] },
    objectives: [{ id: "try", text: "Intenta agarrarlo donde está y lee el torque requerido." }, { id: "deliver", text: "Entrégalo en la zona (pista: la física permite empujar)." }],
    hint: "Con la pinza cerrada y baja puedes empujar el bloque por la mesa hacia la base. Más cerca, el brazo de palanca es menor.",
    explain: ["τ = m·g·d: con 4 kg a 0,95 m el hombro necesitaría ~55 N·m solo por la carga. Empujarlo (Rapier resuelve el contacto y la fricción) reduce d hasta que τ entra en el límite. Así se diseñan celdas reales: la carga útil nominal de un robot se especifica a una distancia."],
  },
  {
    id: "rfree", code: "LIBRE", title: "Celda libre",
    brief: ["Apila, empuja y lanza. Prueba el modo articular para mover cada eje por separado y compara con la IK."],
    cubes: [
      { id: "f1", size: 0.06, mass: 0.4, pos: [0.55, 0.03, 0.3], color: "#ff8a3d", label: "A" },
      { id: "f2", size: 0.06, mass: 0.4, pos: [0.6, 0.03, -0.2], color: "#5ee7ff", label: "B" },
      { id: "f3", size: 0.06, mass: 0.4, pos: [0.35, 0.03, 0.55], color: "#5df2a5", label: "C" },
      { id: "f4", size: 0.08, mass: 1.5, pos: [0.3, 0.04, -0.55], color: "#c44dff", label: "D" },
    ],
    beacons: [], zone: { center: [-0.45, 0.4], size: [0.3, 0.3] }, predict: null, objectives: [], hint: "", explain: [],
  },
];

export default function RoboticsLab() {
  const [mi, setMi] = useState(0);
  const mission = MISSIONS[mi];
  const control = useRef<SimControl>({ goal: null, grip: false, joints: { ...HOME }, events: [] });
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [lens, setLens] = useState(false);
  const [journal, setJournal] = useState(false);
  const [target, setTarget] = useState<[number, number, number] | null>(null);
  const [pitch, setPitch] = useState(-90);
  const [elbow, setElbow] = useState<"up" | "down">("up");
  const [grip, setGrip] = useState(false);
  const [mode, setMode] = useState<"ik" | "joint">("ik");
  const [manual, setManual] = useState<JointState>(HOME);
  const [cubesKey, setCubesKey] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [lastReq, setLastReq] = useState<{ torque: number; ok: boolean } | null>(null);
  const { msg, say } = useToast();

  const beacons: Beacon[] = useMemo(() => mission.beacons.map((p, i) => ({ id: "ABCD"[i], pos: p, reachable: !!reachable(p) })), [mission]);
  const truthBeacons = beacons.filter((b) => b.reachable).map((b) => b.id).sort().join(",");
  // Misión 03: ¿se puede levantar el bloque en su posición inicial? Se calcula
  // con la IK a la altura de agarre y el torque con la carga, no se supone.
  const r3Truth = useMemo(() => {
    const c = MISSIONS[2].cubes[0];
    const s = solveSpatial(spec, c.pos[0], c.pos[1], c.pos[2], -90, "up");
    if (!s.joints) return "no";
    return Math.abs(gravityTorques(spec, s.joints, c.mass).shoulder) <= SHOULDER_LIMIT ? "si" : "no";
  }, []);

  const load = useCallback((i: number) => {
    setMi(i); setCubesKey((k) => k + 1); setTarget(null); setGrip(false); control.current.grip = false; control.current.goal = { ...HOME };
    setAccepted(MISSIONS[i].predict == null); setPicked([]); setRevealed(MISSIONS[i].predict == null ? "skip" : null); setTouched(new Set()); setFlags({}); setLastReq(null);
  }, []);

  const goTo = useCallback((p: [number, number, number], pitchDeg = pitch, el = elbow, quiet = false) => {
    let sol = solveSpatial(spec, p[0], p[1], p[2], pitchDeg, el);
    if (!sol.ok) {
      const alt = solveSpatial(spec, p[0], p[1], p[2], pitchDeg, el === "up" ? "down" : "up");
      if (alt.ok) { sol = alt; setElbow(el === "up" ? "down" : "up"); }
    }
    setTarget(p);
    if (!sol.ok || !sol.joints) {
      if (!quiet) say(sol.limitViolations.length ? `Sin solución dentro de límites: ${sol.limitViolations.join("; ")}.` : `Fuera de la envolvente: la muñeca quedaría a ${sol.reach.toFixed(3)} m del hombro (máx. ${(spec.l1 + spec.l2).toFixed(2)} m).`, "bad");
      return false;
    }
    control.current.goal = sol.joints;
    setMode("ik");
    return true;
  }, [pitch, elbow, say]);

  // eventos del simulador (agarre, saturación…)
  useEffect(() => {
    const id = setInterval(() => {
      const evs = control.current.events.splice(0);
      for (const e of evs) {
        if (e.type === "grasp") { say(`Agarre: ${e.detail} sujeto. Hombro: ${e.torque!.toFixed(1)} N·m.`, "good"); setFlags((f) => ({ ...f, grasp: true })); setLastReq({ torque: e.torque!, ok: true }); }
        if (e.type === "grasp-refused") { say(`El hombro necesitaría ${e.torque!.toFixed(1)} N·m > ${SHOULDER_LIMIT} N·m: el motor no puede sostener la carga aquí.`, "bad"); setFlags((f) => ({ ...f, try: true })); setLastReq({ torque: e.torque!, ok: false }); }
        if (e.type === "release") say("Pinza abierta.", "info");
        if (e.type === "stall") say(`Saturación: el hombro llegaría a ${e.torque!.toFixed(1)} N·m (límite ${SHOULDER_LIMIT}). Movimiento detenido.`, "bad");
      }
    }, 120);
    return () => clearInterval(id);
  }, [say]);

  // revelar predicción en el momento en que el experimento la decide
  useEffect(() => {
    if (!accepted || revealed != null || !mission.predict || picked.length === 0) return;
    let truth: string | null = null;
    if (mission.id === "r2" && flags.grasp && tel) {
      const m = mission.cubes[0].mass;
      const a = Math.abs(gravityTorques(spec, tel.joints, m).shoulder), b = Math.abs(gravityTorques(spec, tel.joints, 0).shoulder);
      truth = a > b + 1e-6 ? "up" : a < b - 1e-6 ? "down" : "same";
    }
    if (mission.id === "r3" && (flags.try || flags.grasp)) truth = r3Truth;
    if (mission.id === "r1" && touched.size > 0) truth = truthBeacons;
    if (truth != null) {
      setRevealed(truth);
      const mine = picked.slice().sort().join(",");
      logJournal({ lab: "robotica", kind: "prediccion", text: `${mission.predict.question} → predije «${mine}», resultado «${truth}».`, ok: mine === truth });
      if (!lens) setLens(true);
    }
  }, [accepted, revealed, mission, picked, flags, touched, truthBeacons, lens, tel, r3Truth]);

  // objetivos
  const inZone = useCallback((id: string) => {
    if (!mission.zone || !tel) return false;
    const c = tel.cubes[id]; if (!c) return false;
    const [zx, zz] = mission.zone.center, [sx, sz] = mission.zone.size;
    return Math.abs(c.pos[0] - zx) < sx / 2 && Math.abs(c.pos[2] - zz) < sz / 2 && c.speed < 0.02 && c.pos[1] < 0.07 && tel.held !== id;
  }, [mission, tel]);

  useEffect(() => {
    if (!tel || mission.id !== "r1") return;
    for (const b of beacons) {
      if (touched.has(b.id)) continue;
      if (Math.hypot(tel.tool[0] - b.pos[0], tel.tool[1] - b.pos[1], tel.tool[2] - b.pos[2]) < 0.03) setTouched((s) => new Set(s).add(b.id));
    }
  }, [tel, beacons, touched, mission.id]);

  const objDone: Record<string, boolean> = {
    touch: mission.id === "r1" && beacons.filter((b) => b.reachable).every((b) => touched.has(b.id)),
    grasp: !!flags.grasp,
    deliver: mission.cubes.length > 0 && inZone(mission.cubes[0].id),
    try: !!flags.try,
  };
  const allDone = mission.objectives.length > 0 && mission.objectives.every((o) => objDone[o.id]);
  useEffect(() => {
    if (allDone && !done[mission.id]) {
      setDone((d) => ({ ...d, [mission.id]: true }));
      say(`Misión «${mission.title}» completada.`, "good");
      logJournal({ lab: "robotica", kind: "mision", text: `Misión ${mission.code} «${mission.title}» completada.`, ok: true });
    }
  }, [allDone, done, mission, say]);

  const phase: Phase = !accepted ? 0 : picked.length === 0 ? 1 : revealed == null ? 2 : allDone ? 4 : 3;

  // fantasma: la otra solución de codo para el objetivo actual (lente)
  const ghost = useMemo(() => {
    if (!target) return null;
    const s = solveSpatial(spec, target[0], target[1], target[2], pitch, elbow === "up" ? "down" : "up");
    return s.joints ?? null;
  }, [target, pitch, elbow]);

  function onPickPoint(p: [number, number, number], cubeId?: string) {
    if (mission.id === "r1") {
      const b = beacons.find((x) => Math.hypot(x.pos[0] - p[0], x.pos[2] - p[2]) < 0.08 && !cubeId);
      if (b) { const r = reachable(b.pos); if (r) { setPitch(r.pitch); goTo(b.pos, r.pitch, r.elbow); } else goTo(b.pos, -90, elbow); return; }
    }
    const hover = cubeId ? p[1] + 0.14 : 0.12;
    goTo([p[0], hover, p[2]]);
  }

  const nudge = (dy: number) => { if (target) goTo([target[0], Math.max(0.02, target[1] + dy), target[2]]); };
  const toggleGrip = () => { const g = !grip; setGrip(g); control.current.grip = g; };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.key === " ") { e.preventDefault(); toggleGrip(); }
      if (e.key === "ArrowUp") { e.preventDefault(); nudge(0.03); }
      if (e.key === "ArrowDown") { e.preventDefault(); nudge(-0.03); }
      if (e.key.toLowerCase() === "h") { control.current.goal = { ...HOME }; setTarget(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const j = tel?.joints ?? HOME;
  const tq = tel?.torques ?? gravityTorques(spec, HOME, 0);
  const pct = Math.min(100, (Math.abs(tq.shoulder) / SHOULDER_LIMIT) * 100);
  const fkTool = forward(spec, j).tool;

  // ¿bloques: ¿qué beacons faltan?
  const reachIds = beacons.filter((b) => b.reachable).map((b) => b.id);

  return (
    <main className="xp">
      <Stage camera={{ position: [2.5, 1.75, 2.3], fov: 40 }} fog={[4, 9]} bloom={1}>
        <RobotSim spec={spec} control={control} cubes={mission.cubes} cubesKey={cubesKey} beacons={beacons} zone={mission.zone} lens={lens}
          target={target} ghost={ghost} onTelemetry={setTel} onPickPoint={onPickPoint} />
      </Stage>

      <div className="xp-hud">
        <TopBar code="LAB·03" title="Robótica — celda de manipulación" lens={lens} onLens={() => setLens((v) => !v)} fidelity={FIDELITY} onJournal={() => setJournal((v) => !v)} />
        <Toast msg={msg} />

        <aside className="xp-panel xp-panel-left" aria-label="Misión">
          <div className="xp-panel-section">
            <div className="xp-missions">{MISSIONS.map((m, i) => <button key={m.id} type="button" className={`xp-mission-tab ${i === mi ? "is-active" : ""} ${done[m.id] ? "is-done" : ""}`} onClick={() => load(i)}>{m.code}</button>)}</div>
            <p className="xp-eyebrow"><i /> Misión {mission.code}</p>
            <h2 className="xp-h2">{mission.title}</h2>
            {mission.brief.map((b) => <p key={b} className="xp-p">{b}</p>)}
            {mission.predict && <PhaseTrack phase={phase} />}
            {mission.predict && !accepted && <div className="xp-btn-row"><button type="button" className="xp-btn xp-btn-primary xp-btn-block" onClick={() => setAccepted(true)}>Aceptar misión</button></div>}
          </div>
          {accepted && mission.predict && (
            <div className="xp-panel-section">
              {!mission.predict.multi && (
                <Predict question={mission.predict.question} choices={mission.predict.choices} picked={picked[0] ?? null}
                  onPick={(id) => { if (!revealed) setPicked([id]); }} truth={revealed} locked={revealed != null} />
              )}
              {mission.predict.multi && <div className="xp-predict"><p className="xp-eyebrow"><i /> Tu predicción</p><p className="xp-predict-q" style={{ margin: 0 }}>{mission.predict.question}</p></div>}
              {mission.predict.multi && (
                <p className="xp-p xp-small" style={{ marginTop: 8 }}>
                  Marcadas: <b className="xp-mono" style={{ color: "var(--xp-amber)" }}>{picked.length ? picked.slice().sort().join(", ") : "—"}</b>
                  {revealed && <> · Alcanzables según el solver: <b className="xp-mono" style={{ color: "var(--xp-good)" }}>{reachIds.join(", ") || "ninguna"}</b></>}
                </p>
              )}
              {mission.predict.multi && !revealed && (
                <div className="xp-choice-row" style={{ marginTop: 6 }}>
                  {mission.predict.choices.map((c) => <button key={c.id} type="button" className={`xp-choice ${picked.includes(c.id) ? "is-picked" : ""}`} onClick={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}>{picked.includes(c.id) ? "✓ " : ""}{c.label}</button>)}
                </div>
              )}
              {revealed && revealed !== "skip" && (
                <div className={`xp-verdict ${picked.slice().sort().join(",") === revealed ? "good" : "bad"}`}>
                  {picked.slice().sort().join(",") === revealed ? "Tu predicción coincide con el cálculo." : "El cálculo no coincide con tu predicción. La lente muestra el porqué."}
                </div>
              )}
            </div>
          )}
          {(accepted || !mission.predict) && mission.objectives.length > 0 && (mission.predict == null || picked.length > 0) && (
            <div className="xp-panel-section">
              <p className="xp-eyebrow"><i /> Objetivos</p>
              <ul className="xp-objectives">{mission.objectives.map((o) => <li key={o.id} className={objDone[o.id] ? "is-done" : ""}>{o.text}</li>)}</ul>
              {mission.id === "r1" && <p className="xp-p xp-small xp-muted" style={{ marginTop: 8 }}>Tocadas: {[...touched].join(", ") || "—"}</p>}
              {!allDone && <p className="xp-p xp-small xp-muted" style={{ marginTop: 8 }}>Pista: {mission.hint}</p>}
            </div>
          )}
          {allDone && (
            <div className="xp-panel-section">
              <p className="xp-eyebrow"><i /> Explicación</p>
              {mission.explain.map((t) => <p key={t} className="xp-p">{t}</p>)}
              <div className="xp-formula" style={{ marginTop: 10 }}>{`τ_hombro = g·Σ mᵢ·dᵢ + g·m_carga·d_pinza\nlímite   = ${SHOULDER_LIMIT} N·m`}</div>
              {mi < MISSIONS.length - 1 && <div className="xp-btn-row"><button type="button" className="xp-btn xp-btn-primary xp-btn-block" onClick={() => load(mi + 1)}>Siguiente misión →</button></div>}
            </div>
          )}
        </aside>

        {!journal && (
          <aside className="xp-panel xp-panel-right" aria-label="Instrumentos">
            <div className="xp-panel-section">
              <p className="xp-eyebrow"><i style={{ background: tel?.stalled ? "var(--xp-bad)" : "var(--xp-good)" }} /> Telemetría {tel?.stalled ? "· SATURADO" : tel?.moving ? "· en movimiento" : ""}</p>
              <div className="xp-readouts">
                <div className="xp-readout"><span>Base θ₀</span><b>{j.yaw.toFixed(1)}°</b></div>
                <div className="xp-readout"><span>Hombro θ₁</span><b>{j.shoulder.toFixed(1)}°</b></div>
                <div className="xp-readout"><span>Codo θ₂</span><b>{j.elbow.toFixed(1)}°</b></div>
                <div className="xp-readout"><span>Muñeca θ₃</span><b>{j.wrist.toFixed(1)}°</b></div>
                <div className="xp-readout wide"><span>Pinza (x, y, z) m</span><b className="cyan">{fkTool.map((v) => v.toFixed(3)).join("  ")}</b></div>
              </div>
            </div>
            <div className="xp-panel-section">
              <p className="xp-eyebrow"><i /> Torque estático {tel?.payload ? `· carga ${tel.payload} kg` : ""}</p>
              {(["shoulder", "elbow", "wrist"] as const).map((k) => {
                const lim = k === "shoulder" ? SHOULDER_LIMIT : k === "elbow" ? 30 : 10;
                const v = Math.abs(tq[k]); const p = Math.min(100, (v / lim) * 100);
                return (
                  <div key={k} style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }} className="xp-mono xp-small"><span className="xp-muted">{k === "shoulder" ? "Hombro" : k === "elbow" ? "Codo" : "Muñeca"}</span><span>{v.toFixed(1)} / {lim} N·m</span></div>
                    <div className="xp-bar"><i style={{ width: `${p}%`, background: p > 90 ? "var(--xp-bad)" : p > 70 ? "var(--xp-amber)" : "var(--xp-good)" }} /></div>
                  </div>
                );
              })}
              {lastReq && <p className="xp-p xp-small" style={{ marginTop: 10, color: lastReq.ok ? "var(--xp-good)" : "var(--xp-bad)" }}>Último agarre: hombro requería {lastReq.torque.toFixed(1)} N·m {lastReq.ok ? "✓" : "✗ (supera el límite)"}</p>}
              {lens && <div className="xp-formula" style={{ marginTop: 10 }}>{`τ₁ = g·(m₁·d₁ + m₂·d₂ + m₃·d₃ + m_c·d_c)\nd = brazo horizontal desde el hombro\nuso actual del motor: ${pct.toFixed(0)} %`}</div>}
            </div>
            <div className="xp-panel-section">
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className={`xp-btn ${mode === "ik" ? "xp-btn-cyan" : ""}`} onClick={() => setMode("ik")}><Crosshair size={13} /> Cartesiano</button>
                <button type="button" className={`xp-btn ${mode === "joint" ? "xp-btn-cyan" : ""}`} onClick={() => { setMode("joint"); setManual({ ...j }); }}><SlidersHorizontal size={13} /> Articular</button>
              </div>
              {mode === "ik" ? (
                <>
                  <div className="xp-field"><label htmlFor="pitch">Orientación pinza {pitch}°</label><input id="pitch" type="range" min={-90} max={90} step={5} className="xp-range" value={pitch} onChange={(e) => { const v = Number(e.target.value); setPitch(v); if (target) goTo(target, v, elbow, true); }} /></div>
                  <div className="xp-btn-row">
                    <button type="button" className="xp-btn" onClick={() => { const e2 = elbow === "up" ? "down" : "up"; setElbow(e2); if (target) goTo(target, pitch, e2); }}>Codo: {elbow === "up" ? "arriba" : "abajo"}</button>
                  </div>
                  {target && <p className="xp-p xp-small xp-muted" style={{ marginTop: 8 }}>Objetivo: {target.map((v) => v.toFixed(2)).join(", ")} m</p>}
                </>
              ) : (
                (["yaw", "shoulder", "elbow", "wrist"] as const).map((k) => {
                  const range: [number, number] = k === "yaw" ? [-180, 180] : spec.limits[k];
                  return (
                    <div className="xp-field" key={k}><label htmlFor={`j-${k}`}>{k === "yaw" ? "Base" : k === "shoulder" ? "Hombro" : k === "elbow" ? "Codo" : "Muñeca"} {manual[k].toFixed(0)}°</label>
                      <input id={`j-${k}`} type="range" min={range[0]} max={range[1]} className="xp-range" value={manual[k]} onChange={(e) => { const m = { ...manual, [k]: Number(e.target.value) }; setManual(m); control.current.goal = m; setTarget(null); }} /></div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        <Journal lab="robotica" open={journal} onClose={() => setJournal(false)} />

        <div className="xp-hint-bar">Clic en mesa/cubo/baliza = objetivo · ↑↓ altura · Espacio pinza · H inicio · arrastra para orbitar</div>
        <nav className="xp-dock" aria-label="Controles del brazo">
          <button type="button" className="xp-tool" onClick={() => nudge(0.05)} disabled={!target}><ArrowUp />Subir</button>
          <button type="button" className="xp-tool" onClick={() => nudge(-0.05)} disabled={!target}><ArrowDown />Bajar</button>
          <button type="button" className="xp-tool" onClick={() => { if (target) goTo([target[0], (mission.cubes[0]?.size ?? 0.06) / 2 + 0.005, target[2]]); }} disabled={!target}><Hand />A la mesa</button>
          <button type="button" className={`xp-tool ${grip ? "is-active" : ""}`} onClick={toggleGrip}><Grip />{grip ? "Abrir" : "Cerrar"}</button>
          <span className="xp-dock-sep" />
          <button type="button" className="xp-tool" onClick={() => { control.current.goal = { ...HOME }; setTarget(null); }}><Home />Inicio</button>
          <button type="button" className="xp-tool" onClick={() => load(mi)}><RotateCcw />Reiniciar</button>
        </nav>
      </div>
    </main>
  );
}
