"use client";

/**
 * Replaces a plain results `<table>` with an instrument panel: one card per
 * component, a real 7-segment primary reading, and a status light — all
 * sourced straight from the caller's `Run.result`, nothing computed here.
 */
import SevenSegmentReadout from "./SevenSegmentReadout";

export interface ReadoutItem {
  id: string;
  label: string;
  value: number;
  decimals?: number;
  unit: string;
  secondary?: string;
  status?: "good" | "bad" | "neutral";
  statusLabel?: string;
  /** True when there is genuinely no numeric reading to show (e.g. no path
   * exists between two devices) — renders a dim placeholder instead of
   * `value`, so a missing reading is never drawn as if it were a real 0. */
  noReading?: boolean;
}

interface Props {
  items: ReadoutItem[];
  emptyLabel?: string;
}

export default function RunConsole({ items, emptyLabel = "Sin corrida todavía — armá el circuito y ejecutá." }: Props) {
  if (items.length === 0) {
    return <div className="run-console run-console-empty">{emptyLabel}</div>;
  }
  return (
    <div className="run-console">
      {items.map((it) => (
        <div key={it.id} className={`readout-card readout-${it.status ?? "neutral"}`}>
          <div className="readout-card-head">
            <span className="readout-label">{it.label}</span>
            <span className={`readout-light readout-light-${it.status ?? "neutral"}`} />
          </div>
          {it.noReading ? (
            <span className="seven-seg seven-seg-blank">— —</span>
          ) : (
            <SevenSegmentReadout value={it.value} decimals={it.decimals ?? 2} unit={it.unit} />
          )}
          {it.secondary && <div className="readout-secondary mono">{it.secondary}</div>}
          {it.statusLabel && <div className="readout-status-label">{it.statusLabel}</div>}
        </div>
      ))}
    </div>
  );
}
