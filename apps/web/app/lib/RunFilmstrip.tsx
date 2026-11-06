"use client";

/**
 * Replaces the plain run-comparison `<table>` with a horizontal filmstrip —
 * each past Run as its own instrument card, scrollable, instead of rows of
 * text. Still just a different rendering of the same real `Run[]` the
 * caller already has; no new data is computed here.
 */
export interface FilmstripRun {
  id: string;
  index: number;
  changedSummary: string;
  readoutSummary: string;
}

interface Props {
  runs: FilmstripRun[];
}

export default function RunFilmstrip({ runs }: Props) {
  return (
    <div className="run-filmstrip">
      {runs.map((r) => (
        <div key={r.id} className="filmstrip-card">
          <span className="filmstrip-index mono">#{r.index}</span>
          <span className="filmstrip-changed mono">{r.changedSummary}</span>
          <span className="filmstrip-readout mono">{r.readoutSummary}</span>
        </div>
      ))}
    </div>
  );
}
