"use client";

/**
 * Draggable burette: grab the stopcock handle and pull it down to add
 * titrant (sets max_titrant_volume), release to save+run. The flask's
 * liquid color reflects the pH of the LAST REAL BACKEND RESULT at that
 * volume — never a client-computed guess — so until you run it the flask
 * stays neutral grey, not a faked color.
 */
import { useRef, useState } from "react";
import { materialDefs } from "../lib/pieceMaterials";

interface Props {
  volumeL: number;
  rangeMaxL: number;
  phAtVolume: number | null;
  onVolumeChange: (v: number) => void;
  onDragEnd: () => void;
  energizing?: boolean;
}

const W = 220;
const H = 380;
const TRACK_TOP = 40;
const TRACK_BOTTOM = 180;

// Illustrative universal-indicator-style banding (not a specific named
// indicator's exact transition range) — purely a visual read of the real
// computed pH, not a substitute for it (the number is shown alongside).
function phColor(ph: number): string {
  if (ph <= 3) return "#ef4444";
  if (ph <= 6) return "#f97316";
  if (ph <= 8) return "#84cc16";
  if (ph <= 11) return "#38bdf8";
  return "#a855f7";
}

export default function TitrationBench({ volumeL, rangeMaxL, phAtVolume, onVolumeChange, onDragEnd, energizing }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const { defs } = materialDefs("bench", "bench-shadow");

  const frac = Math.max(0, Math.min(1, volumeL / rangeMaxL));
  const handleY = TRACK_TOP + frac * (TRACK_BOTTOM - TRACK_TOP);

  function clientToVolume(clientY: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return volumeL;
    const scaleY = H / rect.height;
    const y = (clientY - rect.top) * scaleY;
    const f = Math.max(0, Math.min(1, (y - TRACK_TOP) / (TRACK_BOTTOM - TRACK_TOP)));
    return Math.round(f * rangeMaxL * 1e6) / 1e6;
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    setDragging(true);
    function onMove(ev: PointerEvent) {
      onVolumeChange(clientToVolume(ev.clientY));
    }
    function onUp() {
      setDragging(false);
      onDragEnd();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const liquidColor = phAtVolume !== null ? phColor(phAtVolume) : "#475569";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", userSelect: "none" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {defs}
        <defs>
          <linearGradient id="bench-glass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1e293b" stopOpacity={0.5} />
            <stop offset="15%" stopColor="#64748b" stopOpacity={0.35} />
            <stop offset="30%" stopColor="#1e293b" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#1e293b" stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <g filter="url(#bench-shadow)">
          <rect x={W / 2 - 10} y={10} width={20} height={TRACK_BOTTOM - 10} fill="url(#bench-glass)" stroke="var(--border)" />
          <rect x={W / 2 - 9} y={10} width={18} height={(TRACK_BOTTOM - 10) * (1 - frac * 0.6)} fill="#60a5fa" opacity={0.5} />
        </g>
        <line x1={W / 2 - 24} y1={handleY} x2={W / 2 + 24} y2={handleY} stroke="var(--lab-accent, var(--accent))" strokeWidth={6} strokeLinecap="round"
          style={{ cursor: "ns-resize" }} onPointerDown={handlePointerDown} />
        <circle cx={W / 2} cy={handleY} r={9} fill="var(--lab-accent, var(--accent))" style={{ cursor: "ns-resize" }} onPointerDown={handlePointerDown} />
        <text x={W / 2 + 32} y={handleY + 4} fontSize={11} fill="var(--text)" fontFamily="var(--font-mono)">{(volumeL * 1000).toFixed(2)} mL</text>

        <g filter="url(#bench-shadow)" className={energizing ? "is-energizing" : undefined}>
          <path d={`M ${W / 2 - 34} 210 L ${W / 2 - 34} 260 L ${W / 2 - 58} 340 Q ${W / 2} 365 ${W / 2 + 58} 340 L ${W / 2 + 34} 260 L ${W / 2 + 34} 210 Z`}
            fill="url(#bench-glass)" stroke="var(--border)" strokeWidth={2} />
          <path d={`M ${W / 2 - 50} 330 Q ${W / 2} 352 ${W / 2 + 50} 330 L ${W / 2 + 58} 340 Q ${W / 2} 365 ${W / 2 - 58} 340 Z`}
            fill={liquidColor} opacity={0.8} />
          {/* glass specular highlight */}
          <path d={`M ${W / 2 - 28} 215 L ${W / 2 - 42} 255`} stroke="#fff" strokeOpacity={0.15} strokeWidth={4} strokeLinecap="round" />
        </g>
        <line x1={W / 2} y1={180} x2={W / 2} y2={210} stroke="var(--border)" strokeWidth={2} />
      </svg>
      <p className="canvas-hint" style={{ textAlign: "center" }}>
        Arrastrá el pico de la bureta para fijar el volumen de titulante agregado
        {dragging ? " (soltá para ejecutar)" : ""}. El color del matraz refleja el último pH real calculado, no una animación.
      </p>
    </div>
  );
}
