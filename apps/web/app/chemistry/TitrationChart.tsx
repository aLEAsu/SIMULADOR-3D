"use client";

import { TitrationPoint } from "./types";

const W = 520;
const H = 260;
const PAD = 36;

export default function TitrationChart({ series, equivalenceVolume }: { series: TitrationPoint[]; equivalenceVolume: number }) {
  if (series.length === 0) return null;
  const maxV = Math.max(...series.map((p) => p.titrant_volume), 0.001);
  const x = (v: number) => PAD + (v / maxV) * (W - PAD * 2);
  const y = (ph: number) => H - PAD - (ph / 14) * (H - PAD * 2);

  const points = series.map((p) => `${x(p.titrant_volume)},${y(p.ph)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ maxWidth: 560 }}>
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#334155" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#334155" />
      <line x1={PAD} y1={y(7)} x2={W - PAD} y2={y(7)} stroke="#475569" strokeDasharray="3 3" />
      <text x={W - PAD} y={y(7) - 4} fontSize={9} fill="#94a3b8" textAnchor="end">pH 7</text>
      <line x1={x(equivalenceVolume)} y1={PAD} x2={x(equivalenceVolume)} y2={H - PAD} stroke="#f87171" strokeDasharray="3 3" />
      <text x={x(equivalenceVolume) + 4} y={PAD + 10} fontSize={9} fill="#f87171">eq. = {(equivalenceVolume * 1000).toFixed(2)} mL</text>
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth={2} />
      <text x={PAD} y={H - 8} fontSize={9} fill="#94a3b8">0 mL</text>
      <text x={W - PAD} y={H - 8} fontSize={9} fill="#94a3b8" textAnchor="end">{(maxV * 1000).toFixed(0)} mL titulante</text>
      <text x={4} y={PAD} fontSize={9} fill="#94a3b8">pH 14</text>
      <text x={4} y={H - PAD} fontSize={9} fill="#94a3b8">pH 0</text>
    </svg>
  );
}
