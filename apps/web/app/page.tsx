"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, EngineMetadata } from "./lib/api";

const LAB_LINKS: Record<string, { href: string; title: string }> = {
  electronics: { href: "/electronics", title: "Electrónica" },
  networking: { href: "/networking", title: "Redes" },
  agriculture: { href: "/agriculture", title: "Naturaleza y Agricultura" },
  physics: { href: "/physics", title: "Física" },
  chemistry: { href: "/chemistry", title: "Química" },
  robotics: { href: "/robotics", title: "Robótica" },
};

export default function HomePage() {
  const [engines, setEngines] = useState<EngineMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listEngines().then(setEngines).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main>
      <h1>Universal Science Lab</h1>
      <p className="subtitle">
        Núcleo universal + adaptadores de motor por disciplina. Ver docs/00-discovery.md, docs/01-architecture.md
        y docs/02-roadmap.md en el repositorio para la investigación, arquitectura y estado real de cada fase.
      </p>

      {error && (
        <p className="error">
          No se pudo conectar con la API en localhost:8000 ({error}). ¿Está corriendo <code>uvicorn main:app --reload --port 8000</code>?
        </p>
      )}

      <div className="row" style={{ alignItems: "stretch" }}>
        {engines?.map((e) => {
          const link = LAB_LINKS[e.discipline];
          return (
            <div key={e.name} className="panel" style={{ width: 300 }}>
              <h3 style={{ marginTop: 0 }}>{link?.title ?? e.discipline}</h3>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Adaptador <span className="badge">{e.name} v{e.version}</span>
              </p>
              <p style={{ fontSize: 13 }}>{e.fidelity_label}</p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Nivel de fidelidad: {e.fidelity_level}/5</p>
              {link && <Link href={link.href}><button>Entrar</button></Link>}
            </div>
          );
        })}
      </div>
    </main>
  );
}
