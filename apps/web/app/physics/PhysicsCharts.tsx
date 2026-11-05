"use client";

import { PhysicsSample } from "./types";

const W = 320;
const H = 240;
const PAD = 30;

function scale(values: number[], size: number) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0.001);
  const range = max - min || 1;
  return (v: number) => PAD + ((v - min) / range) * (size - PAD * 2);
}

export function TrajectoryPlot({ series }: { series: PhysicsSample[] }) {
  if (series.length === 0) return null;
  const xs = series.map((p) => p.x);
  const ys = series.map((p) => p.y);
  const sx = scale(xs, W);
  // y axis inverted (screen y grows down, physics y grows up)
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0.001);
  const rangeY = maxY - minY || 1;
  const sy = (v: number) => H - PAD - ((v - minY) / rangeY) * (H - PAD * 2);

  const points = series.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ maxWidth: 360 }}>
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#334155" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#334155" />
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth={2} />
      <circle cx={sx(series[0].x)} cy={sy(series[0].y)} r={4} fill="#4ade80" />
      <circle cx={sx(series[series.length - 1].x)} cy={sy(series[series.length - 1].y)} r={4} fill="#f87171" />
      <text x={PAD} y={H - 8} fontSize={9} fill="#94a3b8">x (m)</text>
      <text x={4} y={PAD} fontSize={9} fill="#94a3b8">y (m)</text>
    </svg>
  );
}

export function EnergyChart({ series }: { series: PhysicsSample[] }) {
  if (series.length === 0) return null;
  const ts = series.map((p) => p.t);
  const sx = scale(ts, W);
  const allEnergy = series.flatMap((p) => [p.kinetic_energy, p.potential_energy, p.total_energy]);

  const minE = Math.min(...allEnergy, 0);
  const maxE = Math.max(...allEnergy, 0.001);
  const rangeE = maxE - minE || 1;
  const y = (v: number) => H - PAD - ((v - minE) / rangeE) * (H - PAD * 2);

  const line = (key: "kinetic_energy" | "potential_energy" | "total_energy") =>
    series.map((p) => `${sx(p.t)},${y(p[key])}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ maxWidth: 360 }}>
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#334155" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#334155" />
      <polyline points={line("kinetic_energy")} fill="none" stroke="#4ade80" strokeWidth={1.5} />
      <polyline points={line("potential_energy")} fill="none" stroke="#fbbf24" strokeWidth={1.5} />
      <polyline points={line("total_energy")} fill="none" stroke="#f87171" strokeWidth={2} strokeDasharray="4 2" />
      <text x={PAD} y={16} fontSize={9} fill="#4ade80">cinética</text>
      <text x={PAD + 50} y={16} fontSize={9} fill="#fbbf24">potencial</text>
      <text x={PAD + 100} y={16} fontSize={9} fill="#f87171">total</text>
    </svg>
  );
}
