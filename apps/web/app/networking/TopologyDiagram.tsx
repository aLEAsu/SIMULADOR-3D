"use client";

import { Device, Link } from "./types";

interface Props {
  devices: Device[];
  links: Link[];
}

const COLOR_BY_TYPE: Record<string, string> = {
  pc: "#38bdf8",
  router: "#fbbf24",
  switch: "#a78bfa",
};

export default function TopologyDiagram({ devices, links }: Props) {
  if (devices.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: 13 }}>Sin dispositivos todavía.</p>;
  }
  const radius = 110;
  const center = { x: 150, y: 140 };
  const positions: Record<string, { x: number; y: number }> = {};
  devices.forEach((d, i) => {
    const angle = (2 * Math.PI * i) / devices.length - Math.PI / 2;
    positions[d.id] = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });

  return (
    <svg viewBox="0 0 300 300" width="100%" height="300" style={{ maxWidth: 320 }}>
      {links.map((l, i) => {
        const a = positions[l.a];
        const b = positions[l.b];
        if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#475569" strokeWidth={2} />;
      })}
      {devices.map((d) => (
        <g key={d.id}>
          <circle cx={positions[d.id].x} cy={positions[d.id].y} r={14} fill={COLOR_BY_TYPE[d.type]} stroke="#0b1220" strokeWidth={2} />
          <text x={positions[d.id].x} y={positions[d.id].y - 20} fontSize={10} fill="#e2e8f0" textAnchor="middle">{d.id}</text>
          {d.ip && (
            <text x={positions[d.id].x} y={positions[d.id].y + 26} fontSize={8} fill="#94a3b8" textAnchor="middle">
              {d.ip}/{d.prefix}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
