"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Atom,
  Cable,
  ChevronDown,
  CircuitBoard,
  FlaskConical,
  Leaf,
  Microscope,
  Network,
  Orbit,
  Search,
  ShieldCheck,
  Sparkles,
  Wifi,
  X,
} from "lucide-react";
import { api, EngineMetadata } from "../lib/api";

const LABS = [
  {
    id: "electronics",
    title: "Electrónica",
    area: "Circuitos · análisis DC",
    challenge: "Haz que el LED encienda",
    description: "Construye el circuito, cambia sus componentes y comprueba qué ocurre con la corriente.",
    href: "/electronics",
    icon: CircuitBoard,
    color: "mint",
    kind: "simulation",
    method: "Análisis nodal",
    mark: "01",
    featured: false,
  },
  {
    id: "networking",
    title: "Redes",
    area: "Infraestructura · IPv4",
    challenge: "Diseña una red alcanzable",
    description: "Asigna subredes y sigue la conectividad entre dispositivos de tu topología.",
    href: "/networking",
    icon: Network,
    color: "blue",
    kind: "simulation",
    method: "Subnetting + grafo",
    mark: "02",
    featured: true,
  },
  {
    id: "agriculture",
    title: "Agrociencia",
    area: "Cultivos · grados-día",
    challenge: "¿Llegará el cultivo a madurez?",
    description: "Explora el efecto del clima acumulado sobre las etapas de desarrollo de una parcela.",
    href: "/agriculture",
    icon: Leaf,
    color: "lime",
    kind: "simulation",
    method: "Modelo GDD",
    mark: "03",
    featured: false,
  },
  {
    id: "physics",
    title: "Física",
    area: "Mecánica · escena 3D",
    challenge: "Suelta el péndulo. Lee su energía.",
    description: "Modifica las condiciones iniciales y observa una integración numérica paso a paso.",
    href: "/physics",
    icon: Orbit,
    color: "violet",
    kind: "simulation",
    method: "Integrador RK4",
    mark: "04",
    featured: false,
  },
  {
    id: "chemistry",
    title: "Química",
    area: "Química analítica · titulación",
    challenge: "Encuentra el punto de equivalencia",
    description: "Dosifica una base en ácido y sigue cómo el balance de moles determina el pH.",
    href: "/chemistry",
    icon: FlaskConical,
    color: "coral",
    kind: "simulation",
    method: "Balance de moles",
    mark: "05",
    featured: false,
  },
  {
    id: "robotics",
    title: "Robótica",
    area: "Manipulación · brazo planar",
    challenge: "Alcanza una coordenada objetivo",
    description: "Lleva el extremo del brazo a su destino y compara las configuraciones posibles.",
    href: "/robotics",
    icon: Activity,
    color: "amber",
    kind: "simulation",
    method: "Cinemática inversa",
    mark: "06",
    featured: true,
  },
  {
    id: "anatomy",
    title: "Anatomía",
    area: "Atlas · sistema óseo",
    challenge: "Explora el esqueleto en 3D",
    description: "Busca, selecciona y aísla estructuras óseas de un modelo anatómico jerárquico.",
    href: "/anatomy",
    icon: Atom,
    color: "ivory",
    kind: "atlas",
    method: "Visor 3D interactivo",
    mark: "07",
    featured: true,
  },
];

type LabFilter = "all" | "simulation" | "atlas";

export default function HomePage() {
  const [engines, setEngines] = useState<EngineMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LabFilter>("all");
  const [query, setQuery] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    api.listEngines()
      .then((result) => { if (active) { setEngines(result); setError(null); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, []);

  async function checkConnection() {
    setChecking(true);
    try {
      setEngines(await api.listEngines());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  const visibleLabs = LABS.filter((lab) => {
    const matchesFilter = filter === "all" || lab.kind === filter;
    const text = `${lab.title} ${lab.area} ${lab.challenge} ${lab.description}`.toLocaleLowerCase("es");
    return matchesFilter && text.includes(query.trim().toLocaleLowerCase("es"));
  });
  const featuredLabs = visibleLabs.filter((lab) => lab.featured);
  const otherLabs = visibleLabs.filter((lab) => !lab.featured);
  const focusedView = filter === "all" && !query.trim();
  const engineCount = engines?.length ?? 0;

  function renderLabTile(lab: (typeof LABS)[number], index: number) {
    const Icon = lab.icon;
    const engine = engines?.find((item) => item.discipline === lab.id);
    return (
      <Link key={lab.id} href={lab.href} className={`lab-tile tone-${lab.color}`} style={{ "--tile-order": index } as React.CSSProperties}>
        <div className="lab-tile-top">
          <span className="lab-tile-mark">{lab.mark} <i>/</i> {lab.kind === "atlas" ? "ATLAS" : "SIM"}</span>
          <span className="lab-tile-icon"><Icon size={18} strokeWidth={1.7} /></span>
        </div>
        <p className="lab-tile-area">{lab.area}</p>
        <h3>{lab.title}</h3>
        <p className="lab-tile-challenge">{lab.challenge}</p>
        <p className="lab-tile-description">{lab.description}</p>
        <div className="lab-tile-footer">
          <span className="lab-method"><i className={engine || lab.kind === "atlas" ? "method-ready" : "method-idle"} />{engine || lab.kind === "atlas" ? lab.method : engines ? "Motor no disponible" : error ? "Motor desconectado" : "Consultando motor…"}</span>
          <span className="lab-enter" aria-hidden="true"><ArrowUpRight size={17} /></span>
        </div>
        {engine && <span className="lab-fidelity">FIDELIDAD {engine.fidelity_level}/5</span>}
      </Link>
    );
  }

  return (
    <main className="hub-page">
      <header className="hub-header">
        <Link className="hub-brand" href="/" aria-label="Aula de campo, inicio">
          <span className="hub-brand-mark"><Sparkles size={17} strokeWidth={2.2} /></span>
          <span>AULA <b>DE CAMPO</b></span>
        </Link>
        <div className="hub-header-right">
          <span className={`hub-system-status ${engines ? "is-online" : error ? "is-offline" : "is-loading"}`}>
            <i /> {engines ? "MOTORES EN LÍNEA" : error ? "MODO DE EXPLORACIÓN" : "CONECTANDO"}
          </span>
          <span className="hub-header-divider" />
          <span className="hub-edition">LABORATORIO DIGITAL <span>·</span> 2026</span>
        </div>
      </header>

      <section className="hub-hero" aria-labelledby="hub-title">
        <div className="hub-hero-copy">
          <div className="hub-eyebrow"><span>01</span> UNA PREGUNTA, UN EXPERIMENTO</div>
          <h1 id="hub-title">La ciencia<br />se pone <em>a prueba.</em></h1>
          <p className="hub-intro">No vengas a mirar una respuesta. Cambia las condiciones, ejecuta el modelo y descubre qué hace que cambie.</p>
          <Link className="hub-primary-link" href="/networking">
            <span>Explorar redes</span><ArrowUpRight size={17} />
          </Link>
          <div className="hub-proofline">
            <span><ShieldCheck size={14} /> Resultados calculados</span>
            <span><Activity size={14} /> Modelos explicables</span>
          </div>
        </div>

        <Link href="/networking" className="mission-preview" aria-label="Abrir el laboratorio de topologías de red">
          <div className="mission-topline">
            <span className="mission-live"><i /> LABORATORIO DE REFERENCIA</span>
            <span className="mission-index">EXP. 01 / 03</span>
          </div>
          <div className="mission-title-row">
            <div>
              <p className="mission-kicker">REDES · TOPOLOGÍA Y ALCANCE</p>
              <h2>¿Llega el<br />paquete?</h2>
            </div>
            <span className="mission-arrow"><ArrowUpRight size={19} /></span>
          </div>
          <div className="mission-network" aria-hidden="true">
            <div className="network-label network-label-left">192.168.1.0/24</div>
            <div className="network-label network-label-right">192.168.2.0/24</div>
            <svg viewBox="0 0 460 154" role="img">
              <defs>
                  <filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              </defs>
              <path d="M69 77h62m64 0h39m58 0h37m64 0h9" fill="none" stroke="#324a3b" strokeWidth="3" strokeLinecap="round"/>
                <path d="M69 77h62m64 0h39m58 0h37m64 0h9" fill="none" stroke="#9cb9a0" strokeWidth="1" strokeDasharray="3 6" strokeLinecap="round" opacity=".55"/>
              <g fill="#a4e7c2" filter="url(#node-glow)"><circle cx="97" cy="77" r="2.5"/><circle cx="214" cy="77" r="2.5"/><circle cx="348" cy="77" r="2.5"/></g>
              <g className="network-device" transform="translate(27 49)">
                <rect width="42" height="33" rx="4" fill="#263a30" stroke="#83d4aa"/><rect x="5" y="5" width="32" height="20" rx="2" fill="#101b15" stroke="#537e64"/><path d="M15 29h12m-6-4v4" stroke="#83d4aa" strokeWidth="1.5"/><text x="21" y="98" textAnchor="middle">PC-01</text>
              </g>
              <g className="network-device" transform="translate(131 60)">
                <rect width="64" height="33" rx="6" fill="#273832" stroke="#a9d67a"/><circle cx="12" cy="16" r="2" fill="#d7f36a"/><circle cx="22" cy="16" r="2" fill="#74d9b0"/><circle cx="32" cy="16" r="2" fill="#74d9b0"/><circle cx="42" cy="16" r="2" fill="#74d9b0"/><circle cx="52" cy="16" r="2" fill="#74d9b0"/><text x="32" y="87" textAnchor="middle">SWITCH</text>
              </g>
              <g className="network-device" transform="translate(234 55)">
                 <path d="M29 0 58 22 29 44 0 22z" fill="#403c2a" stroke="#d7f36a" strokeWidth="1.4"/><path d="M19 22h20m-10-8 9 8-9 8" fill="none" stroke="#e9f5b5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><text x="29" y="92" textAnchor="middle">ROUTER</text>
              </g>
              <g className="network-device" transform="translate(329 60)">
                <rect width="64" height="33" rx="6" fill="#273832" stroke="#82bfe2"/><circle cx="12" cy="16" r="2" fill="#78bde8"/><circle cx="22" cy="16" r="2" fill="#78bde8"/><circle cx="32" cy="16" r="2" fill="#78bde8"/><circle cx="42" cy="16" r="2" fill="#78bde8"/><circle cx="52" cy="16" r="2" fill="#78bde8"/><text x="32" y="87" textAnchor="middle">SWITCH</text>
              </g>
              <g className="network-device" transform="translate(402 49)">
                <rect width="42" height="33" rx="4" fill="#26343a" stroke="#78bde8"/><rect x="5" y="5" width="32" height="20" rx="2" fill="#11191b" stroke="#547990"/><path d="M15 29h12m-6-4v4" stroke="#78bde8" strokeWidth="1.5"/><text x="21" y="98" textAnchor="middle">PC-02</text>
              </g>
              <path d="M15 126h430" stroke="#d7f0df" strokeOpacity=".12"/>
            </svg>
            <div className="mission-note"><span>01</span> CONFIGURA <ArrowDownRight size={12} /> <span>02</span> COMPRUEBA ALCANCE</div>
          </div>
          <div className="mission-bottomline">
            <span><Network size={14} /> IPV4 · VLAN · FIREWALL</span>
            <span>ABRIR LABORATORIO <ArrowRight size={14} /></span>
          </div>
        </Link>
      </section>

      <section className="hub-telemetry" aria-label="Estado de la plataforma">
        <div className="telemetry-lead"><span className="telemetry-marker" /> UN NÚCLEO, TRES LABORATORIOS INSIGNIA</div>
        <div className="telemetry-stat"><b>{engines ? String(engineCount).padStart(2, "0") : "06"}</b><span>motores científicos {engines ? "disponibles" : "integrados"}</span></div>
        <div className="telemetry-stat"><b>01</b><span>atlas 3D explorable</span></div>
        <div className="telemetry-caption">Cada espacio declara su método y alcance.</div>
      </section>

      <section className="hub-labs" id="practicas" aria-labelledby="labs-title">
        <div className="hub-section-head">
          <div>
            <p className="hub-eyebrow"><span>02</span> ELIGE TU CAMPO</p>
            <h2 id="labs-title">Tres laboratorios<br className="mobile-break" /> <em>para ir más allá.</em></h2>
          </div>
          <div className="hub-search-wrap">
            <Search size={16} aria-hidden="true" />
            <input aria-label="Buscar práctica" placeholder="Buscar práctica o disciplina" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button className="hub-clear-search" type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}><X size={15} /></button>}
          </div>
        </div>

        <div className="hub-filter-row" role="group" aria-label="Filtrar espacios">
          <div className="hub-filters">
            {([ ["all", "Todos", "07"], ["simulation", "Simuladores", "06"], ["atlas", "Visor 3D", "01"] ] as const).map(([id, label, count]) => (
              <button key={id} type="button" className={`hub-filter ${filter === id ? "is-active" : ""}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
          <span className="hub-result-count">{visibleLabs.length} DISPONIBLES</span>
        </div>

        {error && (
          <div className="hub-api-notice" role="status">
            <Wifi size={16} />
            <span><b>Vista de exploración.</b> El servicio de cálculo no responde; puedes conocer los laboratorios, pero para ejecutar una práctica inicia la API.</span>
            <button type="button" onClick={checkConnection} disabled={checking}>{checking ? "Comprobando…" : "Reintentar"}</button>
          </div>
        )}

        {visibleLabs.length > 0 ? (
          <>
            {featuredLabs.length > 0 && (
              <>
                <div className="hub-group-heading"><span>LABORATORIOS DE REFERENCIA</span><small>EXPERIENCIAS EN FOCO</small></div>
                <div className="hub-lab-grid">{featuredLabs.map(renderLabTile)}</div>
              </>
            )}
            {otherLabs.length > 0 && focusedView ? (
              <details className="hub-secondary-group">
                <summary className="hub-more-button">
                  <span><b>OTROS LABORATORIOS</b><small>{otherLabs.length} espacios disponibles para explorar</small></span>
                  <ChevronDown size={18} />
                </summary>
                <div className="hub-lab-grid hub-secondary-grid">{otherLabs.map(renderLabTile)}</div>
              </details>
            ) : otherLabs.length > 0 ? (
              <>
                <div className="hub-group-heading hub-group-secondary"><span>OTRAS PRÁCTICAS</span><small>CATÁLOGO COMPLETO</small></div>
                <div className="hub-lab-grid">{otherLabs.map(renderLabTile)}</div>
              </>
            ) : null}
          </>
        ) : (
          <div className="hub-empty-state"><Microscope size={22} /><p>No encontramos una práctica con “{query}”.</p><button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Ver todos los espacios</button></div>
        )}
      </section>

      <footer className="hub-footer">
        <Link className="hub-brand" href="/"><span className="hub-brand-mark"><Sparkles size={15} /></span><span>AULA <b>DE CAMPO</b></span></Link>
        <span>EXPERIMENTAR ES PARTE DEL MÉTODO.</span>
        <span className="hub-footer-meta"><Cable size={13} /> {engines ? `${engineCount} MOTORES CONECTADOS` : "MODELOS DECLARADOS · RESULTADOS TRAZABLES"}</span>
      </footer>
    </main>
  );
}
