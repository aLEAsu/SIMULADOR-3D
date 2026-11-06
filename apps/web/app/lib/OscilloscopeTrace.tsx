"use client";

/**
 * Instrument-style line chart for a real time series — a glowing trace on a
 * phosphor grid, not a generic chart-library line chart. The only motion is
 * the trace "drawing itself" when the data it's given changes (a `key`
 * remount restarts the CSS draw animation); it always draws the exact
 * points it was handed, nothing interpolated or guessed between runs.
 */
export interface ThresholdLine {
  label: string;
  value: number;
  color: string;
}
export interface TracePoint {
  x: number;
  y: number;
}

interface Props {
  points: TracePoint[];
  /** Horizontal reference lines at a constant y (e.g. a GDD stage threshold). */
  thresholds?: ThresholdLine[];
  /** Vertical reference lines at a constant x (e.g. a titration equivalence volume). */
  verticalMarkers?: ThresholdLine[];
  color?: string;
  height?: number;
  xStartLabel?: string;
  xEndLabel?: string;
  emptyLabel?: string;
  /** Fixed y-axis ceiling (e.g. pH's 0–14 scale) instead of auto-scaling to the data. */
  yMax?: number;
}

export default function OscilloscopeTrace({
  points, thresholds = [], verticalMarkers = [], color = "var(--lab-accent, var(--accent))",
  height = 220, xStartLabel, xEndLabel, emptyLabel = "Sin datos todavía.", yMax,
}: Props) {
  const width = 560;
  const padding = 32;

  if (points.length === 0) {
    return <div className="scope scope-empty">{emptyLabel}</div>;
  }

  const maxX = Math.max(1, ...points.map((p) => p.x), ...verticalMarkers.map((m) => m.value));
  const maxY = yMax ?? Math.max(1, ...thresholds.map((t) => t.value), ...points.map((p) => p.y)) * 1.05;
  const sx = (x: number) => padding + (x / maxX) * (width - padding * 2);
  const sy = (y: number) => height - padding - (y / maxY) * (height - padding * 2);
  const linePoints = points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
  // Remount (and so replay the draw-in animation) only when the real series
  // actually changed, not on every render.
  const traceKey = `${points.length}-${points[points.length - 1]?.y.toFixed(2)}`;

  return (
    <div className="scope">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <defs>
          <pattern id="usl-scope-grid" width={28} height={22} patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 22" fill="none" stroke={color} strokeOpacity={0.14} strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect x={padding} y={padding} width={width - padding * 2} height={height - padding * 2} fill="url(#usl-scope-grid)" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-strong)" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border-strong)" />
        {thresholds.map((t) => (
          <g key={t.label}>
            <line x1={padding} y1={sy(t.value)} x2={width - padding} y2={sy(t.value)} stroke={t.color} strokeDasharray="4 4" strokeWidth={1} opacity={0.75} />
            <text x={width - padding} y={sy(t.value) - 3} fontSize={9} fill={t.color} textAnchor="end" fontFamily="var(--font-mono)">
              {t.label} ({t.value})
            </text>
          </g>
        ))}
        {verticalMarkers.map((m) => (
          <g key={m.label}>
            <line x1={sx(m.value)} y1={padding} x2={sx(m.value)} y2={height - padding} stroke={m.color} strokeDasharray="4 4" strokeWidth={1} opacity={0.75} />
            <text x={sx(m.value) + 4} y={padding + 10} fontSize={9} fill={m.color} fontFamily="var(--font-mono)">{m.label}</text>
          </g>
        ))}
        <polyline key={traceKey} points={linePoints} fill="none" stroke={color} strokeWidth={2} className="scope-trace" />
        {xStartLabel && (
          <text x={padding} y={height - 8} fontSize={9} fill="var(--muted)" fontFamily="var(--font-mono)">{xStartLabel}</text>
        )}
        {xEndLabel && (
          <text x={width - padding} y={height - 8} fontSize={9} fill="var(--muted)" textAnchor="end" fontFamily="var(--font-mono)">{xEndLabel}</text>
        )}
      </svg>
    </div>
  );
}
