import { Piece, PieceRenderContext, PieceType } from "../lib/InteractiveCanvas";
import { materialDefs } from "../lib/pieceMaterials";
import { DailyWeather, Plot } from "./types";

/** The real backend stage string for this plot's last Run, if any — piggy-
 * backed onto the piece the same way electronics reads `props` (see
 * electronics/canvasAdapter.tsx): agriculture/page.tsx sets `stage` on each
 * piece from `PlotResult.current_stage` before handing it to
 * InteractiveCanvas. Four real values come from `apps/api/engines/agriculture/solver.py`:
 * "sin germinar", "germinada, en desarrollo vegetativo", "floración", "madurez". */
function stageOf(piece: Piece): string | undefined {
  return (piece as unknown as { stage?: string }).stage;
}

function plotBody({ piece, selected }: PieceRenderContext) {
  const stage = stageOf(piece);
  const shadowId = `plot-shadow-${piece.uid}`;
  const soilId = `plot-soil-${piece.uid}`;
  const { defs } = materialDefs(piece.uid, shadowId);
  const germinated = stage && stage !== "sin germinar";
  const flowering = stage === "floración" || stage === "madurez";
  const mature = stage === "madurez";
  const stemTop = mature ? -16 : flowering ? -12 : germinated ? -3 : 10;

  return (
    <>
      {defs}
      <defs>
        <linearGradient id={soilId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a6a3f" />
          <stop offset="100%" stopColor="#4d3a22" />
        </linearGradient>
      </defs>
      <g filter={`url(#${shadowId})`}>
        <ellipse cx={0} cy={14} rx={26} ry={8} fill={`url(#${soilId})`} stroke={selected ? "var(--lab-accent, var(--accent))" : "#3a2c18"} strokeWidth={selected ? 2 : 1} />
        <path d="M -20 12 Q -10 9 0 12 T 20 12" fill="none" stroke="#3a2c18" strokeWidth={1} opacity={0.6} />

        {!germinated && <ellipse cx={0} cy={9} rx={2.6} ry={1.8} fill="#78350f" />}

        {germinated && (
          <>
            <line x1={0} y1={10} x2={0} y2={stemTop} stroke="#4ade80" strokeWidth={2} strokeLinecap="round" />
            <path d="M 0 2 Q -8 0 -9 -5" fill="none" stroke="#4ade80" strokeWidth={1.6} strokeLinecap="round" />
            <path d="M 0 2 Q 8 0 9 -5" fill="none" stroke="#4ade80" strokeWidth={1.6} strokeLinecap="round" />
          </>
        )}
        {(flowering || mature) && (
          <>
            <path d="M 0 -6 Q -7 -9 -8 -14" fill="none" stroke="#22c55e" strokeWidth={1.6} strokeLinecap="round" />
            <path d="M 0 -6 Q 7 -9 8 -14" fill="none" stroke="#22c55e" strokeWidth={1.6} strokeLinecap="round" />
          </>
        )}
        {flowering && !mature && (
          <circle cx={0} cy={stemTop - 2} r={3.4} fill="#fbbf24" stroke="#b45309" strokeWidth={0.8} />
        )}
        {mature && (
          <>
            <ellipse cx={0} cy={stemTop - 2} rx={4.5} ry={6} fill="#eab308" stroke="#854d0e" strokeWidth={0.8} />
            <ellipse cx={0} cy={stemTop - 2} rx={2.6} ry={3.6} fill="#fde047" opacity={0.7} />
          </>
        )}
      </g>
    </>
  );
}

export const PIECE_TYPES: PieceType[] = [
  { type: "plot", label: "Parcela", glyph: "🌱", color: "#a3e635", width: 64, height: 48, renderBody: plotBody, terminals: [] },
];

let counter = 1;
export function nextPlotId(): string {
  return `parcela${counter++}`;
}

export function makeDays(n: number, tmin: number, tmax: number): DailyWeather[] {
  return Array.from({ length: n }, (_, i) => ({ day: i + 1, tmin, tmax }));
}

// Widely-cited starting points from agronomic extension literature (e.g.
// USDA/university extension GDD guides) — NOT verified by this project
// against a primary source, and explicitly presented that way in the UI.
// Swap for a local agronomic source before using on a real crop.
export const SPECIES_REFERENCE: Record<string, { t_base: number; germination: number; flowering: number; maturity: number }> = {
  "Maíz (referencia, no verificado)": { t_base: 10, germination: 50, flowering: 750, maturity: 1400 },
  "Soja (referencia, no verificado)": { t_base: 10, germination: 40, flowering: 600, maturity: 1200 },
  "Trigo (referencia, no verificado)": { t_base: 0, germination: 100, flowering: 900, maturity: 1900 },
};

export function defaultPlot(label: string): Plot {
  return {
    label,
    t_base: 10,
    days: makeDays(60, 15, 27),
    thresholds: { germination: 50, flowering: 600, maturity: 1200 },
  };
}
