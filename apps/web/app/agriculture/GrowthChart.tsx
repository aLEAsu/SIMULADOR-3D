"use client";

import { GrowthSeriesPoint, Thresholds } from "./types";

interface Props {
  series: GrowthSeriesPoint[];
  thresholds: Thresholds;
}

export default function GrowthChart({ series, thresholds }: Props) {
  if (series.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: 13 }}>Sin resultados todavía.</p>;
  }
  const width = 560;
  const height = 220;
  const padding = 32;
  const maxGdd = Math.max(thresholds.maturity, ...series.map((p) => p.gdd_accumulated)) * 1.05;
  const maxDay = series[series.length - 1].day;

  const x = (day: number) => padding + (day / maxDay) * (width - padding * 2);
  const y = (gdd: number) => height - padding - (gdd / maxGdd) * (height - padding * 2);

  const linePoints = series.map((p) => `${x(p.day)},${y(p.gdd_accumulated)}`).join(" ");

  const thresholdLines: [string, number, string][] = [
    ["Germinación", thresholds.germination, "#4ade80"],
    ["Floración", thresholds.flowering, "#fbbf24"],
    ["Madurez", thresholds.maturity, "#f87171"],
  ];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#334155" />
      {thresholdLines.map(([label, value, color]) => (
        <g key={label}>
          <line x1={padding} y1={y(value)} x2={width - padding} y2={y(value)} stroke={color} strokeDasharray="4 4" strokeWidth={1} />
          <text x={width - padding} y={y(value) - 3} fontSize={9} fill={color} textAnchor="end">{label} ({value})</text>
        </g>
      ))}
      <polyline points={linePoints} fill="none" stroke="#38bdf8" strokeWidth={2} />
      <text x={padding} y={height - 8} fontSize={9} fill="#94a3b8">día 1</text>
      <text x={width - padding} y={height - 8} fontSize={9} fill="#94a3b8" textAnchor="end">día {maxDay}</text>
    </svg>
  );
}
