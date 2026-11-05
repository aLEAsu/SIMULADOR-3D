"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AnatomyViewer from "./AnatomyViewer";

const MODEL_URL = "/models/anatomy/skeletal-system.glb";

export default function AnatomyPage() {
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const filtered = useMemo(
    () => names.filter((n) => n.toLowerCase().includes(filter.toLowerCase())),
    [names, filter]
  );

  return (
    <main className="lab-anatomy">
      <p><Link href="/">← Volver al catálogo</Link></p>
      <h1>Laboratorio de Anatomía — Sistema óseo</h1>
      <p className="subtitle">
        Visor 3D jerárquico, sin motor de cálculo (la anatomía no se "simula", se explora). Modelo real
        derivado de BodyParts3D vía Z-Anatomy — no es un placeholder. Hacé clic en una estructura para
        aislarla, o en el fondo para volver a verlas todas. Activá "Modo armar/desarmar" para agarrar una
        estructura seleccionada y separarla físicamente del esqueleto — útil para estudiarla aislada en el
        espacio — y "Rearmar todo" para devolver todo a su posición original.
      </p>

      <section className="panel">
        <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <AnatomyViewer
              modelUrl={MODEL_URL}
              onLoaded={setNames}
              onLoadError={setLoadError}
              selected={selected}
              onSelect={setSelected}
            />
            {loadError && <p className="error">No se pudo cargar el modelo: {loadError}</p>}
            {!loadError && names.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>Cargando modelo (~7 MB)…</p>
            )}
          </div>

          <div style={{ width: 260 }}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filtrar entre ${names.length || "…"} estructuras`}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <div style={{ maxHeight: 440, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
              {filtered.map((name) => (
                <div
                  key={name}
                  onClick={() => setSelected(selected === name ? null : name)}
                  style={{
                    padding: "5px 8px",
                    fontSize: 12,
                    cursor: "pointer",
                    background: selected === name ? "var(--accent)" : "transparent",
                    color: selected === name ? "#0b1220" : "var(--text)",
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
            {selected && (
              <p style={{ fontSize: 13, marginTop: 8 }}>
                Estructura aislada: <strong>{selected}</strong>
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Procedencia y licencia (obligatorio, no decorativo)</h3>
        <p style={{ fontSize: 12, lineHeight: 1.6 }}>
          Modelo derivado de <strong>BodyParts3D — The Database Center for Life Science — CC-BY-SA 2.1 Japan</strong>{" "}
          (original: <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noreferrer">dbarchive.biosciencedbc.jp</a>),
          vía <strong>Z-Anatomy — The libre 3D atlas of anatomy — CC-BY-SA 4.0</strong>{" "}
          (<a href="https://github.com/Z-Anatomy/Models-of-human-anatomy" target="_blank" rel="noreferrer">github.com/Z-Anatomy</a>,
          autores: Kousaku Okubo, Gauthier Kervyn, Marcin Zielinski).
          Archivo fuente: <code>SkeletalSystem100.fbx</code> de{" "}
          <a href="https://github.com/LluisV/Z-Anatomy" target="_blank" rel="noreferrer">github.com/LluisV/Z-Anatomy</a>,
          convertido a glTF/GLB con Blender (<code>tools/anatomy/convert_fbx_to_glb.py</code>).
          Esta página y el archivo convertido se distribuyen bajo la misma licencia{" "}
          <a href="http://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>,
          como exige la licencia original.
        </p>
      </section>
    </main>
  );
}
