"use client";

/**
 * Piezas de HUD comunes a los laboratorios insignia: barra superior, lente,
 * ficha de fidelidad, ciclo de misión (Misión → Predice → Experimenta →
 * Revela → Explica), bloque de predicción y bitácora persistente.
 */
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, ShieldCheck, X } from "lucide-react";
import "./xp.css";

export const PHASES = ["Misión", "Predice", "Experimenta", "Revela", "Explica"] as const;
export type Phase = 0 | 1 | 2 | 3 | 4;

export function TopBar({ code, title, lens, onLens, fidelity, onJournal, right }: {
  code: string; title: string; lens: boolean; onLens: () => void;
  fidelity: { level: string; computes: string[]; omits: string[]; source: string };
  onJournal: () => void; right?: ReactNode;
}) {
  const [showFid, setShowFid] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key.toLowerCase() === "l") onLens();
      if (e.key.toLowerCase() === "b") onJournal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLens, onJournal]);
  return (
    <div className="xp-topbar">
      <Link href="/" className="xp-chip" aria-label="Volver al observatorio"><ArrowLeft size={15} /> <span className="xp-hide-sm">Observatorio</span></Link>
      <span className="xp-chip"><span className="xp-brandcode">{code.split("·")[0]}·<b>{code.split("·")[1]}</b></span><span className="xp-title">{title}</span></span>
      <span className="xp-spacer" />
      {right}
      <span className="xp-fidelity">
        <button className="xp-chip" type="button" onClick={() => setShowFid((v) => !v)} aria-expanded={showFid}>
          <ShieldCheck size={14} color="var(--xp-good)" /> <span className="xp-hide-sm">{fidelity.level}</span>
        </button>
        {showFid && (
          <div className="xp-fidelity-pop" role="dialog">
            <button type="button" className="xp-btn" style={{ position: "absolute", right: 8, top: 8, height: 26, padding: "0 7px" }} onClick={() => setShowFid(false)} aria-label="Cerrar"><X size={13} /></button>
            <h4>Qué calcula este laboratorio</h4>
            <ul>{fidelity.computes.map((c) => <li key={c}>{c}</li>)}</ul>
            <h4>Qué NO modela</h4>
            <ul className="xp-muted">{fidelity.omits.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="xp-p xp-small xp-muted">{fidelity.source}</p>
          </div>
        )}
      </span>
      <button className="xp-chip" type="button" onClick={onJournal}><BookOpen size={14} /> <span className="xp-hide-sm">Bitácora</span> <span className="xp-kbd">B</span></button>
      <button type="button" className={`xp-lens ${lens ? "is-on" : ""}`} onClick={onLens} aria-pressed={lens} title="Revela lo invisible (L)">
        <span className="xp-lens-dot" /> LENTE {lens ? "ON" : "OFF"} <span className="xp-kbd" style={{ borderColor: "currentColor", color: "inherit" }}>L</span>
      </button>
    </div>
  );
}

export function PhaseTrack({ phase }: { phase: Phase }) {
  return (
    <>
      <div className="xp-steps">{PHASES.map((p, i) => <span key={p} className={`xp-step ${i < phase ? "is-done" : i === phase ? "is-current" : ""}`} />)}</div>
      <div className="xp-step-labels">{PHASES.map((p, i) => <span key={p} className={i === phase ? "is-current" : ""}>{p}</span>)}</div>
    </>
  );
}

export interface Choice { id: string; label: string; }

/** Bloque de predicción: el usuario se compromete ANTES de ver el resultado. */
export function Predict({ question, choices, picked, onPick, truth, locked }: {
  question: string; choices: Choice[]; picked: string | null; onPick: (id: string) => void;
  truth?: string | null; locked?: boolean;
}) {
  return (
    <div className="xp-predict">
      <p className="xp-eyebrow"><i /> Tu predicción</p>
      <p className="xp-predict-q">{question}</p>
      <div className="xp-choice-row">
        {choices.map((c) => {
          let cls = "";
          if (truth != null) cls = c.id === truth ? "is-right" : c.id === picked ? "is-wrong" : "";
          else if (c.id === picked) cls = "is-picked";
          return <button key={c.id} type="button" className={`xp-choice ${cls}`} disabled={locked} onClick={() => onPick(c.id)}>{c.label}</button>;
        })}
      </div>
    </div>
  );
}

export function Toast({ msg }: { msg: { text: string; tone?: "good" | "bad" | "info"; id: number } | null }) {
  const [visible, setVisible] = useState<typeof msg>(null);
  useEffect(() => {
    if (!msg) return;
    setVisible(msg);
    const t = setTimeout(() => setVisible(null), 3800);
    return () => clearTimeout(t);
  }, [msg]);
  if (!visible) return null;
  return <div key={visible.id} className={`xp-toast ${visible.tone ?? ""}`} role="status">{visible.text}</div>;
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone?: "good" | "bad" | "info"; id: number } | null>(null);
  return { msg, say: (text: string, tone?: "good" | "bad" | "info") => setMsg({ text, tone, id: Date.now() + Math.random() }) };
}

// ---------- bitácora ----------
export interface JournalEntry { t: number; lab: string; kind: "prediccion" | "resultado" | "mision" | "nota"; text: string; ok?: boolean; }
const KEY = "xp-journal-v1";
export function readJournal(): JournalEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function logJournal(e: Omit<JournalEntry, "t">) {
  try {
    const all = readJournal();
    all.unshift({ ...e, t: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200)));
    window.dispatchEvent(new Event("xp-journal"));
  } catch { /* almacenamiento no disponible: la bitácora es una comodidad */ }
}

export function Journal({ lab, open, onClose }: { lab: string; open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  useEffect(() => {
    const load = () => setEntries(readJournal().filter((e) => e.lab === lab));
    load();
    window.addEventListener("xp-journal", load);
    return () => window.removeEventListener("xp-journal", load);
  }, [lab]);
  if (!open) return null;
  const preds = entries.filter((e) => e.kind === "prediccion" && e.ok != null);
  const hits = preds.filter((e) => e.ok).length;
  return (
    <div className="xp-panel xp-journal" role="dialog" aria-label="Bitácora">
      <div className="xp-panel-section">
        <div style={{ display: "flex", alignItems: "center" }}>
          <p className="xp-eyebrow" style={{ margin: 0, flex: 1 }}><i /> Bitácora de laboratorio</p>
          <button type="button" className="xp-btn" style={{ height: 28, padding: "0 8px" }} onClick={onClose} aria-label="Cerrar bitácora"><X size={14} /></button>
        </div>
        <div className="xp-readouts" style={{ marginTop: 12 }}>
          <div className="xp-readout"><span>Predicciones</span><b>{preds.length}</b></div>
          <div className="xp-readout"><span>Acierto</span><b className={hits / Math.max(preds.length, 1) >= 0.6 ? "good" : ""}>{preds.length ? Math.round((hits / preds.length) * 100) : 0}%</b></div>
        </div>
      </div>
      <div className="xp-panel-section" style={{ overflow: "auto", flex: 1 }}>
        {entries.length === 0 ? <p className="xp-p xp-muted">Todavía no hay registros. Cada predicción, resultado y misión cumplida queda aquí, en este navegador.</p> : (
          <ul className="xp-journal-list">
            {entries.map((e) => (
              <li key={e.t + e.text}>
                <time>{new Date(e.t).toLocaleString("es")} · {e.kind.toUpperCase()}{e.ok != null ? (e.ok ? " · ACIERTO" : " · ERROR") : ""}</time>
                {e.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Loader({ label, done }: { label: string; done: boolean }) {
  const [gone, setGone] = useState(false);
  useEffect(() => { if (done) { const t = setTimeout(() => setGone(true), 800); return () => clearTimeout(t); } }, [done]);
  if (gone) return null;
  return (
    <div className="xp-loader" style={{ opacity: done ? 0 : 1, pointerEvents: done ? "none" : "auto" }}>
      <div className="xp-loader-inner"><div className="xp-loader-ring" />{label}</div>
    </div>
  );
}
