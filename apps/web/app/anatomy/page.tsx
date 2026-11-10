"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Crosshair, Eye, EyeOff, Focus, Layers, Scissors, Search, X } from "lucide-react";
import { Journal, Loader, logJournal, PhaseTrack, Phase, Predict, TopBar, Toast, useToast } from "../xp/Shell";
import { LAYERS, LayerId, LayerState, Registry, Structure, structureBounds } from "./AnatomyScene";

const Stage = dynamic(() => import("../xp/Stage"), { ssr: false });
const AnatomyScene = dynamic(() => import("./AnatomyScene"), { ssr: false });

const FIDELITY = {
  level: "Atlas 3D · datos con procedencia",
  computes: [
    "Cuatro sistemas reales (óseo, muscular, cardiovascular, nervioso), alineados en el mismo espacio de la fuente.",
    "Identidad de cada estructura = nombre del nodo en la fuente (nomenclatura en inglés, tipo Terminologia Anatomica).",
    "Lateralidad desde el sufijo de la fuente; grupo funcional desde el material asignado por Z-Anatomy.",
    "Dimensiones = caja envolvente de la geometría (medida sobre el modelo).",
  ],
  omits: ["Fisiología, biomecánica o flujo: es un atlas, no una simulación.", "Órganos viscerales y piel (no cargados en esta versión).", "Los cortes son geométricos: las mallas son superficies, no volúmenes rellenos."],
  source: "BodyParts3D © DBCLS (CC BY-SA 2.1 JP) vía Z-Anatomy (CC BY-SA 4.0), github.com/LluisV/Z-Anatomy. Convertido a GLB con Blender (tools/anatomy).",
};

/** Traducciones curadas (solo para el reto; la ficha muestra siempre el nombre de la fuente). */
const ES: Record<string, string> = {
  "Femur": "Fémur", "Tibia": "Tibia", "Humerus": "Húmero", "Radius": "Radio", "Ulna": "Cúbito (ulna)", "Scapula": "Escápula", "Clavicle": "Clavícula",
  "Body of sternum": "Cuerpo del esternón", "Manubrium of sternum": "Manubrio del esternón", "Patella": "Rótula", "Sacrum": "Sacro", "Mandible": "Mandíbula", "Fibula": "Peroné (fíbula)",
  "Long head of biceps femoris": "Cabeza larga del bíceps femoral", "Long head of triceps brachii": "Cabeza larga del tríceps braquial", "Acromial part of deltoid muscle": "Porción acromial del deltoides", "Sartorius muscle": "Músculo sartorio",
  "Medial head of gastrocnemius": "Cabeza medial del gastrocnemio", "Rectus femoris muscle": "Músculo recto femoral", "Pectoralis major muscle": "Pectoral mayor", "Descending part of trapezius muscle": "Porción descendente del trapecio",
  "Latissimus dorsi muscle": "Dorsal ancho", "Gluteus maximus muscle": "Glúteo mayor", "Soleus muscle": "Sóleo", "Masseter": "Masetero", "Diaphragm": "Diafragma",
  "Sciatic nerve": "Nervio ciático", "Femoral nerve": "Nervio femoral", "Ulnar nerve": "Nervio cubital", "Median nerve": "Nervio mediano",
  "Radial nerve": "Nervio radial", "Tonsil of cerebellum": "Amígdala cerebelosa", "Optic nerve (II)": "Nervio óptico (II)", "White matter of spinal cord": "Sustancia blanca de la médula espinal",
  "Femoral artery": "Arteria femoral", "Great saphenous vein": "Vena safena magna", "Left common carotid artery": "Arteria carótida común izquierda",
  "Brachial artery": "Arteria braquial", "Radial artery": "Arteria radial", "Internal jugular vein": "Vena yugular interna", "Popliteal artery": "Arteria poplítea",
  "Pulmonary trunk": "Tronco pulmonar", "Inferior vena cava (abdominal part)": "Vena cava inferior (porción abdominal)", "Superior vena cava": "Vena cava superior",
};
const FUNC_ES: Record<string, string> = {
  "Flexion": "Flexión", "Extension": "Extensión", "Internal rotator": "Rotación interna", "External rotation": "Rotación externa", "Tendon": "Tendón",
  "Ligament": "Ligamento", "Cartilage": "Cartílago", "Abduction": "Abducción", "Adduction": "Aducción", "Depressor": "Depresor", "Elevator": "Elevador",
  "Orbicularis/Constrictor": "Orbicular / constrictor", "Artery": "Arteria", "Vein": "Vena", "Pulmonary artery": "Arteria pulmonar", "Pulmonary vein": "Vena pulmonar",
  "Brain": "Encéfalo", "Nucleus": "Núcleo", "White matter": "Sustancia blanca", "Cerebellum": "Cerebelo", "Bone": "Hueso", "Bone-1": "Hueso",
};
const layerLabel = (id: LayerId) => LAYERS.find((l) => l.id === id)!.label;

type Mode = "explore" | "quiz";

export default function AnatomyLab() {
  const registry = useRef<Registry>({ byKey: new Map(), ready: new Set() });
  const [ready, setReady] = useState<LayerId[]>([]);
  const [layers, setLayers] = useState<Record<LayerId, LayerState>>({
    muscular: { visible: true, opacity: 1 }, nervous: { visible: true, opacity: 1 }, cardiovascular: { visible: true, opacity: 1 }, skeletal: { visible: true, opacity: 1 },
  });
  const [lens, setLens] = useState(false);
  const [journal, setJournal] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<{ center: THREE.Vector3; radius: number; id: number } | null>(null);
  const [isolated, setIsolated] = useState<string | null>(null);
  const [attachments, setAttachments] = useState(false);
  const [clipOn, setClipOn] = useState(false);
  const [clipAxis, setClipAxis] = useState<"sagital" | "coronal" | "transversal">("sagital");
  const [clipPos, setClipPos] = useState(0);
  const [mode, setMode] = useState<Mode>("explore");
  const { msg, say } = useToast();

  // ----- reto "Localiza" -----
  const [round, setRound] = useState<{ key: string; predicted: LayerId | null; revealed: boolean; clicked: string | null; errCm: number | null } | null>(null);
  const [score, setScore] = useState({ n: 0, sys: 0, loc: 0 });
  const [quizAccepted, setQuizAccepted] = useState(false);

  const onReady = useCallback((id: LayerId) => setReady((r) => (r.includes(id) ? r : [...r, id])), []);
  const structures = useMemo(() => [...registry.current.byKey.values()].map((e) => e.s), [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const plane = useMemo(() => {
    const n = clipAxis === "sagital" ? new THREE.Vector3(-1, 0, 0) : clipAxis === "coronal" ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, -1, 0);
    const base = clipAxis === "transversal" ? 0.95 : 0;
    const range = clipAxis === "transversal" ? 0.9 : 0.3;
    return new THREE.Plane(n, base + clipPos * range);
  }, [clipAxis, clipPos]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set<string>();
    return structures.filter((s) => {
      const hit = s.name.toLowerCase().includes(q) || (ES[s.base]?.toLowerCase().includes(q) ?? false);
      if (!hit || seen.has(s.key)) return false; seen.add(s.key); return true;
    }).slice(0, 40);
  }, [query, structures]);

  const select = useCallback((key: string | null, fly = false) => {
    setSelected(key);
    if (key && fly) { const b = structureBounds(registry.current, key); if (b) setFocus({ center: b.center, radius: b.radius, id: Date.now() }); }
  }, []);

  const sel = selected ? registry.current.byKey.get(selected)?.s ?? null : null;
  const selBounds = selected ? structureBounds(registry.current, selected) : null;

  // ---------- reto ----------
  const candidates = useMemo(() => structures.filter((s) => ES[s.base] && layers[s.layer].visible), [structures, layers]);
  function newRound() {
    if (candidates.length === 0) { say("Aún cargando sistemas…", "info"); return; }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setRound({ key: pick.key, predicted: null, revealed: false, clicked: null, errCm: null });
    setSelected(null);
  }
  const target = round?.revealed ? round.key : null;
  const roundS = round ? registry.current.byKey.get(round.key)?.s : null;
  const quizPhase: Phase = !quizAccepted ? 0 : !round || !round.predicted ? 1 : !round.revealed ? 2 : 4;

  function onPick(key: string) {
    if (mode === "quiz" && round && round.predicted && !round.revealed) {
      const a = structureBounds(registry.current, key), b = structureBounds(registry.current, round.key);
      const clickedS = registry.current.byKey.get(key)!.s;
      const exact = clickedS.base === roundS!.base && (roundS!.side == null || clickedS.side === roundS!.side);
      const errCm = exact ? 0 : a && b ? a.center.distanceTo(b.center) * 100 : null;
      setRound({ ...round, revealed: true, clicked: key, errCm });
      const sysOk = round.predicted === roundS!.layer;
      setScore((s) => ({ n: s.n + 1, sys: s.sys + (sysOk ? 1 : 0), loc: s.loc + (exact ? 1 : 0) }));
      logJournal({ lab: "anatomia", kind: "prediccion", text: `«${ES[roundS!.base]}»: predije sistema ${layerLabel(round.predicted)} (real: ${layerLabel(roundS!.layer)}); ubicación ${exact ? "exacta" : `a ${errCm?.toFixed(1)} cm`}.`, ok: sysOk && exact });
      say(exact ? "¡Localización exacta!" : `Elegiste «${clickedS.name}». El objetivo estaba a ${errCm?.toFixed(1)} cm (en verde).`, exact ? "good" : "bad");
      if (b) setFocus({ center: b.center, radius: Math.max(b.radius, 0.12), id: Date.now() });
      setSelected(key);
      return;
    }
    select(key);
  }

  const toggleLayer = (id: LayerId) => setLayers((l) => ({ ...l, [id]: { ...l[id], visible: !l[id].visible } }));
  const peel = () => {
    const order: LayerId[] = ["muscular", "nervous", "cardiovascular"];
    const next = order.find((id) => layers[id].visible);
    if (next) { toggleLayer(next); say(`Capa ${layerLabel(next).toLowerCase()} retirada.`, "info"); }
    else { setLayers((l) => ({ ...l, muscular: { ...l.muscular, visible: true }, nervous: { ...l.nervous, visible: true }, cardiovascular: { ...l.cardiovascular, visible: true } })); say("Capas restauradas.", "info"); }
  };

  return (
    <main className="xp">
      <Stage camera={{ position: [1.1, 1.3, 3.6], fov: 34, near: 0.01 }} bloom={0.8} onPointerMissed={() => { if (mode === "explore") setSelected(null); }}>
        <AnatomyScene layers={layers} registry={registry} lens={lens} selected={selected} target={target} showAttachments={attachments} isolate={isolated}
          focus={focus} clip={{ enabled: clipOn, plane }} onPick={(k) => onPick(k)} onReady={onReady} />
      </Stage>
      <Loader label={`CARGANDO SISTEMAS · ${ready.length}/4`} done={ready.length >= 1} />

      <div className="xp-hud">
        <TopBar code="LAB·01" title="Anatomía — cuerpo multicapa" lens={lens} onLens={() => setLens((v) => !v)} fidelity={FIDELITY} onJournal={() => setJournal((v) => !v)}
          right={<span className="xp-chip xp-hide-sm xp-mono" style={{ fontSize: 11 }}>{ready.length}/4 sistemas · {registry.current.byKey.size.toLocaleString("es")} estructuras</span>} />
        <Toast msg={msg} />

        <aside className="xp-panel xp-panel-left" aria-label="Capas y modos">
          <div className="xp-panel-section">
            <div className="xp-missions">
              <button type="button" className={`xp-mission-tab ${mode === "explore" ? "is-active" : ""}`} onClick={() => { setMode("explore"); setRound(null); }}>EXPLORAR</button>
              <button type="button" className={`xp-mission-tab ${mode === "quiz" ? "is-active" : ""}`} onClick={() => { setMode("quiz"); setSelected(null); }}>LOCALIZA</button>
            </div>
            {mode === "explore" ? (
              <>
                <p className="xp-eyebrow"><i /> Disección por capas</p>
                <h2 className="xp-h2">Atraviesa el cuerpo</h2>
                <p className="xp-p">Retira capas, ajusta su transparencia o corta con un plano. Haz clic en cualquier estructura para su ficha. La lente activa la vista de rayos X.</p>
              </>
            ) : (
              <>
                <p className="xp-eyebrow"><i /> Reto · Localiza</p>
                <h2 className="xp-h2">¿Dónde está y a qué sistema pertenece?</h2>
                <p className="xp-p">Cada ronda nombra una estructura. Primero predices su sistema; después la señalas en el cuerpo. El error se mide en centímetros sobre el modelo.</p>
                <PhaseTrack phase={quizPhase} />
                {!quizAccepted && <div className="xp-btn-row"><button type="button" className="xp-btn xp-btn-primary xp-btn-block" onClick={() => { setQuizAccepted(true); newRound(); }}>Empezar reto</button></div>}
              </>
            )}
          </div>

          {mode === "quiz" && round && roundS && (
            <div className="xp-panel-section">
              <p className="xp-eyebrow"><i /> Ronda {score.n + (round.revealed ? 0 : 1)}</p>
              <h2 className="xp-h2" style={{ color: "var(--xp-amber)" }}>{ES[roundS.base]}{roundS.side ? ` (${roundS.side})` : ""}</h2>
              <p className="xp-p xp-small xp-muted xp-mono">{roundS.base}</p>
              <div style={{ marginTop: 10 }}>
                <Predict question="¿A qué sistema pertenece?" choices={LAYERS.map((l) => ({ id: l.id, label: l.label }))} picked={round.predicted}
                  onPick={(id) => { if (!round.revealed) setRound({ ...round, predicted: id as LayerId }); }}
                  truth={round.revealed ? roundS.layer : null} locked={round.revealed} />
              </div>
              {round.predicted && !round.revealed && <div className="xp-verdict info">Ahora haz clic sobre la estructura en el cuerpo. Puedes retirar capas o usar la lente para buscarla.</div>}
              {round.revealed && (
                <>
                  <div className={`xp-verdict ${round.errCm === 0 ? "good" : "bad"}`}>{round.errCm === 0 ? "Ubicación exacta." : `Error de ubicación: ${round.errCm?.toFixed(1)} cm. El objetivo está en verde.`}</div>
                  <div className="xp-btn-row"><button type="button" className="xp-btn xp-btn-primary xp-btn-block" onClick={newRound}>Siguiente ronda →</button></div>
                </>
              )}
              <div className="xp-readouts" style={{ marginTop: 12 }}>
                <div className="xp-readout"><span>Sistema</span><b>{score.sys}/{score.n}</b></div>
                <div className="xp-readout"><span>Ubicación</span><b className="good">{score.loc}/{score.n}</b></div>
              </div>
            </div>
          )}

          <div className="xp-panel-section">
            <p className="xp-eyebrow"><i /> Capas</p>
            {LAYERS.map((l) => (
              <div key={l.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr 90px", alignItems: "center", gap: 8, marginTop: 8 }}>
                <button type="button" className="xp-btn" style={{ height: 28, padding: 0, width: 28 }} onClick={() => toggleLayer(l.id)} aria-label={`${layers[l.id].visible ? "Ocultar" : "Mostrar"} ${l.label}`}>
                  {layers[l.id].visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <span style={{ display: "flex", alignItems: "center", gap: 7, opacity: layers[l.id].visible ? 1 : 0.45 }}>
                  <i style={{ width: 9, height: 9, borderRadius: 3, background: l.color, boxShadow: `0 0 10px ${l.color}` }} />
                  {l.label} {!ready.includes(l.id) && <span className="xp-muted xp-small">· cargando</span>}
                </span>
                <input type="range" min={0.05} max={1} step={0.05} className="xp-range" aria-label={`Opacidad ${l.label}`} value={layers[l.id].opacity}
                  onChange={(e) => setLayers((s) => ({ ...s, [l.id]: { ...s[l.id], opacity: Number(e.target.value) } }))} />
              </div>
            ))}
            <div className="xp-btn-row">
              <button type="button" className="xp-btn" onClick={peel}><Layers size={13} /> Pelar capa</button>
              <button type="button" className={`xp-btn ${attachments ? "xp-btn-cyan" : ""}`} onClick={() => { const v = !attachments; setAttachments(v); }} title="Áreas de origen/inserción muscular marcadas en el esqueleto">Inserciones</button>
            </div>
          </div>

          <div className="xp-panel-section">
            <p className="xp-eyebrow"><i /> Plano de corte</p>
            <div className="xp-btn-row" style={{ marginTop: 0 }}>
              <button type="button" className={`xp-btn ${clipOn ? "xp-btn-cyan" : ""}`} onClick={() => setClipOn((v) => !v)}><Scissors size={13} /> {clipOn ? "Activo" : "Cortar"}</button>
              {(["sagital", "coronal", "transversal"] as const).map((a) => <button key={a} type="button" className={`xp-btn ${clipAxis === a ? "xp-btn-cyan" : ""}`} onClick={() => { setClipAxis(a); setClipOn(true); }}>{a}</button>)}
            </div>
            {clipOn && <input type="range" min={-1} max={1} step={0.01} className="xp-range" style={{ marginTop: 10 }} aria-label="Posición del corte" value={clipPos} onChange={(e) => setClipPos(Number(e.target.value))} />}
          </div>
        </aside>

        {!journal && (
          <aside className="xp-panel xp-panel-right" aria-label="Búsqueda y ficha">
            <div className="xp-panel-section">
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--xp-muted)" }} />
                <input className="xp-input" style={{ paddingLeft: 30 }} placeholder="Buscar: femur, nervio ciático, aorta…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar estructura" />
                {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar" style={{ position: "absolute", right: 6, top: 6, background: "none", border: 0, cursor: "pointer", color: "var(--xp-muted)" }}><X size={14} /></button>}
              </div>
              {results.length > 0 && (
                <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, maxHeight: 210, overflow: "auto" }}>
                  {results.map((s) => (
                    <li key={s.key}>
                      <button type="button" onClick={() => { setMode("explore"); select(s.key, true); }} style={{ width: "100%", textAlign: "left", display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", background: "none", border: 0, borderBottom: "1px solid var(--xp-line)", cursor: "pointer", fontSize: 12 }}>
                        <i style={{ width: 7, height: 7, borderRadius: 2, flex: "none", background: LAYERS.find((l) => l.id === s.layer)!.color }} />
                        <span style={{ flex: 1 }}>{s.name}</span>
                        {ES[s.base] && <span className="xp-muted xp-small">{ES[s.base]}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim().length >= 2 && results.length === 0 && <p className="xp-p xp-small xp-muted" style={{ marginTop: 8 }}>Sin resultados en los sistemas cargados.</p>}
            </div>

            {sel && mode === "explore" ? (
              <div className="xp-panel-section">
                <p className="xp-eyebrow"><i style={{ background: LAYERS.find((l) => l.id === sel.layer)!.color }} /> Sistema {layerLabel(sel.layer).toLowerCase()}</p>
                <h2 className="xp-h2">{ES[sel.base] ?? sel.base}</h2>
                <p className="xp-p xp-small xp-mono xp-muted">{sel.name}</p>
                <dl className="xp-kv" style={{ marginTop: 10 }}>
                  <dt>Lateralidad</dt><dd>{sel.side ?? "—"}</dd>
                  {sel.material && <><dt>Grupo (fuente)</dt><dd>{FUNC_ES[sel.material] ?? sel.material}</dd></>}
                  {selBounds && <><dt>Extensión</dt><dd>{(selBounds.size.x * 100).toFixed(1)} × {(selBounds.size.y * 100).toFixed(1)} × {(selBounds.size.z * 100).toFixed(1)} cm</dd>
                    <dt>Altura centro</dt><dd>{(selBounds.center.y * 100).toFixed(0)} cm</dd></>}
                  <dt>Mallas</dt><dd>{registry.current.byKey.get(sel.key)?.meshes.length}</dd>
                </dl>
                <div className="xp-btn-row">
                  <button type="button" className="xp-btn xp-btn-cyan" onClick={() => select(sel.key, true)}><Focus size={13} /> Enfocar</button>
                  <button type="button" className="xp-btn" onClick={() => { if (isolated) setIsolated(null); else { setIsolated(sel.key); select(sel.key, true); } }}><Crosshair size={13} /> {isolated ? "Mostrar todo" : "Aislar"}</button>
                </div>
                <p className="xp-p xp-small xp-muted" style={{ marginTop: 10 }}>Medidas sobre la geometría del modelo; no son valores clínicos de referencia.</p>
              </div>
            ) : mode === "explore" ? (
              <div className="xp-panel-section">
                <p className="xp-eyebrow"><i /> Ficha</p>
                <p className="xp-p xp-muted">Haz clic en una estructura o búscala por nombre (inglés de la fuente o español común).</p>
              </div>
            ) : null}
            <div className="xp-panel-section">
              <p className="xp-p xp-small xp-muted">BodyParts3D © DBCLS, CC BY-SA 2.1 JP · Z-Anatomy, CC BY-SA 4.0. Derivados compartidos bajo la misma licencia.</p>
            </div>
          </aside>
        )}

        <Journal lab="anatomia" open={journal} onClose={() => setJournal(false)} />
        <div className="xp-hint-bar">Arrastra para orbitar · rueda para acercar · clic en estructura = ficha · L rayos X</div>
      </div>
    </main>
  );
}

export type { Structure };
