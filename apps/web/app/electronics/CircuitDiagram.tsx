"use client";

import { CircuitComponent } from "./types";

interface Props {
  components: CircuitComponent[];
  nodeVoltages?: Record<string, number>;
}

function voltageColor(v: number | undefined): string {
  if (v === undefined) return "#64748b";
  if (v > 0.05) return "#4ade80";
  if (v < -0.05) return "#f87171";
  return "#94a3b8";
}

export default function CircuitDiagram({ components, nodeVoltages }: Props) {
  const nodeNames = Array.from(
    new Set(components.flatMap((c) => [c.node_a, c.node_b]))
  );
  if (nodeNames.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: 13 }}>Sin componentes todavía.</p>;
  }

  const radius = 110;
  const center = { x: 150, y: 140 };
  const positions: Record<string, { x: number; y: number }> = {};
  nodeNames.forEach((name, i) => {
    if (name === "gnd") {
      positions[name] = { x: center.x, y: center.y + radius + 20 };
      return;
    }
    const angle = (2 * Math.PI * i) / nodeNames.length - Math.PI / 2;
    positions[name] = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });

  return (
    <svg viewBox="0 0 300 300" width="100%" height="300" style={{ maxWidth: 320 }}>
      {components.map((c) => {
        const a = positions[c.node_a];
        const b = positions[c.node_b];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          <g key={c.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#475569" strokeWidth={2} />
            <rect x={mid.x - 20} y={mid.y - 9} width={40} height={18} rx={4} fill="#0b1220" stroke="#334155" />
            <text x={mid.x} y={mid.y + 4} fontSize={9} fill="#e2e8f0" textAnchor="middle">
              {c.type === "resistor" ? `${c.id} ${c.value}Ω` : `${c.id} ${c.value}V`}
            </text>
          </g>
        );
      })}
      {nodeNames.map((name) => (
        <g key={name}>
          <circle
            cx={positions[name].x}
            cy={positions[name].y}
            r={12}
            fill={voltageColor(nodeVoltages?.[name])}
            stroke="#0b1220"
            strokeWidth={2}
          />
          <text x={positions[name].x} y={positions[name].y - 16} fontSize={10} fill="#94a3b8" textAnchor="middle">
            {name}
            {nodeVoltages?.[name] !== undefined ? ` (${nodeVoltages[name].toFixed(2)}V)` : ""}
          </text>
        </g>
      ))}
    </svg>
  );
}
