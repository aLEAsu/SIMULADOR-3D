"use client";

/**
 * Instrument-style numeric readout (digital-multimeter look), not a plain
 * number in a table cell. Every digit renders as a real 7-segment glyph;
 * unlit segments stay faintly visible (same as a real LCD/LED display),
 * which is itself part of the "this is an instrument" read, not decoration
 * layered on top of one.
 *
 * The only animation here is a count-up transition from the previously
 * shown value to the new one — purely cosmetic motion. It never displays an
 * intermediate frame as if it were a reading: the only two numbers this
 * component ever claims are "the previous real value" and "the new real
 * value" the caller passed in; everything between is an eased blend drawn
 * on the way there, same contract as a progress bar.
 */
import { useEffect, useRef, useState } from "react";

const SEGMENTS: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

const SEGMENT_POINTS: Record<string, string> = {
  a: "1.5,1 8.5,1 7.2,2.4 2.8,2.4",
  b: "9,1.6 9,8 7.6,6.8 7.6,2.6",
  c: "9,10 9,16.4 7.6,15.1 7.6,11.2",
  d: "1.5,17 8.5,17 7.2,15.6 2.8,15.6",
  e: "1,10 1,16.4 2.4,15.1 2.4,11.2",
  f: "1,1.6 1,8 2.4,6.8 2.4,2.6",
  g: "1.5,9 2.8,7.6 7.2,7.6 8.5,9 7.2,10.4 2.8,10.4",
};

function Digit({ char, color, dim }: { char: string; color: string; dim: string }) {
  if (char === "-") {
    return (
      <svg viewBox="0 0 10 18" width={13} height={23}>
        <polygon points={SEGMENT_POINTS.g} fill={color} />
      </svg>
    );
  }
  if (char === ".") {
    return (
      <svg viewBox="0 0 10 18" width={6} height={23}>
        <circle cx={5} cy={16.5} r={1.3} fill={color} />
      </svg>
    );
  }
  const lit = new Set(SEGMENTS[char] ?? []);
  return (
    <svg viewBox="0 0 10 18" width={13} height={23}>
      {(["a", "b", "c", "d", "e", "f", "g"] as const).map((seg) => (
        <polygon key={seg} points={SEGMENT_POINTS[seg]} fill={lit.has(seg) ? color : dim} />
      ))}
    </svg>
  );
}

interface Props {
  value: number;
  decimals?: number;
  unit?: string;
  color?: string;
  animate?: boolean;
}

export default function SevenSegmentReadout({ value, decimals = 2, unit, color = "var(--lab-accent, var(--accent))", animate = true }: Props) {
  const [shown, setShown] = useState(value);
  const prevRef = useRef(value);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!animate) {
      setShown(value);
      prevRef.current = value;
      return;
    }
    const from = prevRef.current;
    const to = value;
    const duration = 450;
    const start = performance.now();
    cancelAnimationFrame(frameRef.current);
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else prevRef.current = to;
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const text = shown.toFixed(decimals);
  const dim = "color-mix(in srgb, " + color + " 12%, transparent)";

  return (
    <span className="seven-seg" style={{ color }}>
      {text.split("").map((ch, i) => (
        <Digit key={i} char={ch} color={color} dim={dim} />
      ))}
      {unit && <span className="seven-seg-unit">{unit}</span>}
    </span>
  );
}
