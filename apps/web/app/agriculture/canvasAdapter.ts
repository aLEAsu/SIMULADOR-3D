import { PieceType } from "../lib/InteractiveCanvas";
import { DailyWeather, Plot } from "./types";

export const PIECE_TYPES: PieceType[] = [
  { type: "plot", label: "Parcela", glyph: "🌱", color: "#a3e635", width: 64, height: 48, terminals: [] },
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
