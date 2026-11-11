"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { ArrowUpRight, Eye, FlaskConical, Lightbulb, Microscope, Orbit, Sprout, Target } from "lucide-react";
import { readJournal, readProgress } from "./xp/Shell";
import type { Monolith, Station } from "./xp/Observatory";
import "./xp/xp.css";

const Stage = dynamic(() => import("./xp/Stage"), { ssr: false });
const Observatory = dynamic(() => import("./xp/Observatory"), { ssr: false });

const STATIONS: (Station & { code: string; title: string; question: string; lens: string; method: string })[] = [
  { id: "anatomy", href: "/anatomy", angle: -0.62, color: "#ff7a59", kind: "anatomy", code: "LAB·01", title: "Anatomía", question: "¿Dónde está el nervio ciático?", lens: "Rayos X sobre 4 sistemas reales y 3 000+ estructuras", method: "Atlas con procedencia · BodyParts3D" },
  { id: "networking", href: "/networking", angle: 0, color: "#5ee7ff", kind: "network", code: "LAB·02", title: "Redes", question: "¿Llega el paquete?", lens: "Subredes como distritos; paquetes con sus cabeceras salto a salto", method: "Subnetting + grafo · verificado 1:1" },
  { id: "robotics", href: "/robotics", angle: 0.62, color: "#ffb547", kind: "robot", code: "LAB·03", title: "Robótica", question: "¿Puede levantarlo?", lens: "Envolvente de trabajo, solución fantasma y torque en vivo", method: "IK exacta + física Rapier" },
];

const MONOLITHS: Monolith[] = [
  { id: "electronics", href: "/electronics", label: "Electrónica", angle: -1.25, color: "#5df2a5" },
  { id: "physics", href: "/physics", label: "Física", angle: -0.95, color: "#a78bfa" },
  { id: "chemistry", href: "/chemistry", label: "Química", angle: 0.95, color: "#ff5d6c" },
  { id: "agriculture", href: "/agriculture", label: "Agrociencia", angle: 1.25, color: "#c6f36a" },
];
const CLASSIC_ICON: Record<string, typeof Orbit> = { electronics: Lightbulb, physics: Orbit, chemistry: FlaskConical, agriculture: Sprout };

export default function ObservatoryPage() {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [fly, setFly] = useState<THREE.Vector3 | null>(null);
  const [stats, setStats] = useState({ preds: 0, hits: 0, missions: 0 });
  const [progress, setProgress] = useState<Record<string, string>>({});

  useEffect(() => {
    const j = readJournal();
    const preds = j.filter((e) => e.kind === "prediccion" && e.ok != null);
    const p = readProgress();
    setStats({ preds: preds.length, hits: preds.filter((e) => e.ok).length, missions: (p.redes?.length ?? 0) + (p.robotica?.length ?? 0) });
    // avance por laboratorio (misiones completadas, o estructuras localizadas en Anatomía)
    setProgress({
      networking: `${p.redes?.length ?? 0}/4 misiones`,
      robotics: `${p.robotica?.length ?? 0}/3 misiones`,
      anatomy: `${p.anatomia?.length ?? 0} localizadas`,
    });
    STATIONS.forEach((s) => router.prefetch(s.href));
  }, [router]);

  function go(id: string) {
    const s = STATIONS.find((x) => x.id === id);
    if (!s || fly) return;
    const p = new THREE.Vector3(Math.sin(s.angle) * 4.2, 0, -Math.cos(s.angle) * 4.2 + 2.2);
    setFly(p);
    setTimeout(() => router.push(s.href), 900);
  }

  const active = STATIONS.find((s) => s.id === hovered) ?? null;

  return (
    <main className="xp obs">
      <Stage camera={{ position: [0, 2.6, 8.6], fov: 42 }} fog={[9, 22]} bloom={1.15}>
        <Observatory stations={STATIONS} monoliths={MONOLITHS} labels={Object.fromEntries(STATIONS.map((s) => [s.id, { code: s.code, title: s.title, progress: progress[s.id] }]))}
          hovered={hovered} onHover={setHovered} onSelect={(s) => go(s.id)} onSelectMonolith={(m) => router.push(m.href)} flyTo={fly} />
      </Stage>

      <div className="xp-hud" style={{ transition: "opacity .6s", opacity: fly ? 0 : 1 }}>
        <header className="xp-topbar">
          <span className="xp-chip"><span className="obs-mark" /> <b style={{ fontFamily: "var(--xp-display)", letterSpacing: ".18em", fontSize: 12 }}>UMBRAL</b></span>
          <span className="xp-spacer" />
          <span className="xp-chip xp-hide-sm xp-mono" style={{ fontSize: 11 }}>
            <Target size={13} color="var(--xp-amber)" /> {stats.preds} predicciones · {stats.preds ? Math.round((stats.hits / stats.preds) * 100) : 0}% acierto · {stats.missions} misiones
          </span>
        </header>

        <section className="obs-hero" aria-labelledby="obs-title">
          <p className="xp-eyebrow"><i /> Observatorio de simulación científica</p>
          <h1 id="obs-title">Lo invisible,<br /><em>hecho visible.</em></h1>
          <p className="obs-lede">Antes de mirar, <b>predice</b>. Luego experimenta en 3D y enciende la <b style={{ color: "var(--xp-cyan)" }}>lente</b>: corriente de paquetes, envolventes de trabajo, sistemas bajo la piel. Todo lo que ves está calculado.</p>
          <ol className="obs-loop" aria-label="Ciclo de aprendizaje">
            {["Misión", "Predice", "Experimenta", "Revela", "Explica"].map((p, i) => <li key={p}><span>{String(i + 1).padStart(2, "0")}</span>{p}</li>)}
          </ol>
        </section>

        <nav className="obs-stations" aria-label="Laboratorios insignia">
          {STATIONS.map((s) => (
            <button key={s.id} type="button" className={`obs-card ${hovered === s.id ? "is-hot" : ""}`} style={{ "--c": s.color } as React.CSSProperties}
              onMouseEnter={() => setHovered(s.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(s.id)} onBlur={() => setHovered(null)} onClick={() => go(s.id)}>
              <span className="obs-card-code">{s.code}{progress[s.id] && <span className="obs-card-prog">{progress[s.id]}</span>}</span>
              <span className="obs-card-title">{s.title} <ArrowUpRight size={15} /></span>
              <span className="obs-card-q">{s.question}</span>
            </button>
          ))}
        </nav>

        {active && (
          <aside className="obs-detail" key={active.id} style={{ "--c": active.color } as React.CSSProperties}>
            <p className="xp-eyebrow"><Eye size={12} color={active.color} /> La lente revela</p>
            <p className="xp-p">{active.lens}</p>
            <p className="xp-p xp-small xp-muted xp-mono" style={{ marginTop: 6 }}>{active.method}</p>
          </aside>
        )}

        <footer className="obs-classic">
          <span className="xp-mono xp-small xp-muted"><Microscope size={12} /> ARCHIVO CLÁSICO</span>
          {MONOLITHS.map((m) => { const I = CLASSIC_ICON[m.id]; return <Link key={m.id} href={m.href} className="obs-classic-link"><I size={13} color={m.color} /> {m.label}</Link>; })}
        </footer>
      </div>

      <style>{`
        .obs-mark { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid var(--xp-amber); box-shadow: 0 0 12px var(--xp-amber), inset 0 0 6px var(--xp-amber); }
        .obs-hero { position: absolute; left: 40px; top: 96px; width: min(470px, calc(100vw - 32px)); pointer-events: none; animation: xp-in .9s var(--xp-ease) both; }
        .obs-hero h1 { display: block; margin: 6px 0 14px; font-family: var(--xp-display); font-weight: 600; font-size: clamp(38px, 5.4vw, 68px); line-height: .98; letter-spacing: -.035em; color: var(--xp-strong); }
        .obs-hero h1 em { display: inline-block; font-style: normal; background: linear-gradient(90deg, var(--xp-cyan), var(--xp-amber)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .obs-lede { margin: 0; font-size: 15px; line-height: 1.6; color: var(--xp-text); max-width: 430px; }
        .obs-loop { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 18px 0 0; padding: 0; }
        .obs-loop li { display: inline-flex; gap: 6px; align-items: center; padding: 5px 10px; border: 1px solid var(--xp-line); border-radius: 999px; background: rgba(4,6,12,.55); font-size: 11.5px; }
        .obs-loop li span { font-family: var(--xp-mono); font-size: 10px; color: var(--xp-amber); }
        .obs-stations { position: absolute; left: 50%; bottom: 64px; left: auto; right: 40px; transform: none; display: grid; grid-template-columns: repeat(3, minmax(0, 230px)); gap: 10px; animation: xp-in .9s .15s var(--xp-ease) both; }
        .obs-card { text-align: left; display: grid; gap: 4px; padding: 14px 16px; border-radius: 14px; cursor: pointer; border: 1px solid var(--xp-line); background: var(--xp-glass); backdrop-filter: blur(16px); transition: all .3s var(--xp-ease); }
        .obs-card:hover, .obs-card.is-hot { border-color: var(--c); box-shadow: 0 0 0 1px var(--c), 0 18px 50px rgba(0,0,0,.5), 0 0 40px color-mix(in srgb, var(--c) 25%, transparent); transform: translateY(-3px); }
        .obs-card-code { font-family: var(--xp-mono); font-size: 10px; letter-spacing: .14em; color: var(--c); }
        .obs-card-title { display: flex; justify-content: space-between; align-items: center; font-family: var(--xp-display); font-size: 19px; font-weight: 600; color: var(--xp-strong); }
        .obs-card-q { color: var(--xp-muted); font-size: 12.5px; }
        .obs-card-code { display: flex; justify-content: space-between; gap: 8px; }
        .obs-card-prog { color: var(--xp-muted); letter-spacing: .04em; }
        .obs-detail { position: absolute; right: 40px; top: 110px; width: 280px; padding: 14px 16px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); background: var(--xp-glass); backdrop-filter: blur(16px); animation: xp-in .35s var(--xp-ease) both; }
        .obs-classic { position: absolute; right: 40px; bottom: 20px; display: flex; align-items: center; gap: 12px; white-space: nowrap; }
        .obs-classic-link { display: inline-flex; align-items: center; gap: 6px; color: var(--xp-muted); text-decoration: none; font-size: 12px; padding: 4px 8px; border-radius: 8px; }
        .obs-classic-link:hover { color: var(--xp-strong); background: rgba(255,255,255,.05); }
        @media (max-width: 900px) {
          .obs-hero { left: 16px; top: 70px; }
          .obs-hero h1 { font-size: 38px; }
          .obs-lede { font-size: 13.5px; }
          .obs-loop, .obs-detail { display: none; }
          .obs-stations { grid-template-columns: 1fr; width: calc(100vw - 32px); right: 16px; bottom: 64px; gap: 6px; }
          .obs-classic { right: auto; left: 16px; flex-wrap: wrap; white-space: normal; }
          .obs-card { padding: 10px 14px; }
          .obs-card-q { display: none; }
        }
      `}</style>
    </main>
  );
}
