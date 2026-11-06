import { PieceType, PieceRenderContext } from "../lib/InteractiveCanvas";
import { materialDefs } from "../lib/pieceMaterials";
import { Device, DeviceType } from "./types";

/** Real device silhouettes instead of an emoji glyph in a box — each shape
 * is the thing it represents (a monitor, a box with antennas, a shield),
 * not decoration. None of them encode a reading the backend hasn't
 * produced: the only data-driven bit on any device is its `badge` text
 * (IP/VLAN or firewall default action), already computed by the page from
 * the real scene/result before it reaches InteractiveCanvas. */

function pcBody({ piece, selected }: PieceRenderContext) {
  const shadowId = `pc-shadow-${piece.uid}`;
  const screenId = `pc-screen-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <defs>
        <linearGradient id={screenId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a2f" />
          <stop offset="100%" stopColor="#0a1510" />
        </linearGradient>
      </defs>
      <line x1={0} y1={10} x2={0} y2={18} stroke={leadStroke} strokeWidth={2} />
      <g filter={`url(#${shadowId})`}>
        <rect x={-9} y={7} width={18} height={3} rx={1.5} fill="#475569" />
        <rect x={-2} y={2} width={4} height={6} fill="#64748b" />
        <rect x={-13} y={-15} width={26} height={17} rx={2} fill={`url(#${screenId})`} stroke={selected ? "var(--lab-accent, var(--accent))" : "#334155"} strokeWidth={selected ? 2 : 1.2} />
        <rect x={-10} y={-12} width={20} height={2} rx={1} fill="#34d399" opacity={0.55} />
        <circle cx={10} cy={-13} r={1} fill="#34d399" />
      </g>
    </>
  );
}

function routerBody({ piece, selected }: PieceRenderContext) {
  const shadowId = `rt-shadow-${piece.uid}`;
  const bodyId = `rt-body-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#0c4a6e" />
        </linearGradient>
      </defs>
      <line x1={0} y1={7} x2={0} y2={18} stroke={leadStroke} strokeWidth={2} />
      <g filter={`url(#${shadowId})`}>
        <line x1={-8} y1={-7} x2={-13} y2={-16} stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={8} y1={-7} x2={13} y2={-16} stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={-13} cy={-16} r={1.6} fill="#e2e8f0" />
        <circle cx={13} cy={-16} r={1.6} fill="#e2e8f0" />
        <rect x={-16} y={-7} width={32} height={14} rx={3} fill={`url(#${bodyId})`} stroke={selected ? "var(--lab-accent, var(--accent))" : "#0c4a6e"} strokeWidth={selected ? 2 : 1.2} />
        {[-9, -2, 5].map((x) => (
          <rect key={x} x={x} y={3} width={3} height={2} fill="#0a1a24" />
        ))}
      </g>
    </>
  );
}

function switchBody({ piece, selected }: PieceRenderContext) {
  const shadowId = `sw-shadow-${piece.uid}`;
  const bodyId = `sw-body-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>
      <line x1={0} y1={5} x2={0} y2={18} stroke={leadStroke} strokeWidth={2} />
      <g filter={`url(#${shadowId})`}>
        <rect x={-20} y={-5} width={40} height={10} rx={2} fill={`url(#${bodyId})`} stroke={selected ? "var(--lab-accent, var(--accent))" : "#334155"} strokeWidth={selected ? 2 : 1.2} />
        {Array.from({ length: 8 }, (_, i) => -18 + i * 5).map((x) => (
          <rect key={x} x={x} y={-3} width={3} height={5} fill="#0a0e18" />
        ))}
      </g>
    </>
  );
}

function firewallBody({ piece, selected }: PieceRenderContext) {
  const shadowId = `fw-shadow-${piece.uid}`;
  const shieldId = `fw-shield-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <defs>
        <linearGradient id={shieldId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="45%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
      </defs>
      <line x1={0} y1={14} x2={0} y2={18} stroke={leadStroke} strokeWidth={2} />
      <g filter={`url(#${shadowId})`}>
        <path
          d="M -12 -14 L 12 -14 L 12 -2 Q 12 9 0 14 Q -12 9 -12 -2 Z"
          fill={`url(#${shieldId})`}
          stroke={selected ? "var(--lab-accent, var(--accent))" : "#7f1d1d"}
          strokeWidth={selected ? 2 : 1.2}
        />
        {/* keyhole: what the shield is actually protecting */}
        <circle cx={0} cy={-4} r={2.4} fill="#450a0a" />
        <rect x={-1.1} y={-3} width={2.2} height={5} fill="#450a0a" />
      </g>
    </>
  );
}

function apBody({ piece, selected }: PieceRenderContext) {
  const shadowId = `ap-shadow-${piece.uid}`;
  const bodyId = `ap-body-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <defs>
        <radialGradient id={bodyId} cx="40%" cy="30%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <line x1={0} y1={6} x2={0} y2={18} stroke={leadStroke} strokeWidth={2} />
      {/* wireless signal arcs — identity marker that this device is wireless,
          not a signal-strength reading (the backend doesn't compute one) */}
      <g opacity={0.6} stroke="#fbbf24" fill="none" strokeLinecap="round">
        <path d="M -5 -4 A 7 7 0 0 1 5 -4" strokeWidth={1.3} />
        <path d="M -9 -8 A 12.5 12.5 0 0 1 9 -8" strokeWidth={1.3} />
      </g>
      <g filter={`url(#${shadowId})`}>
        <rect x={-8} y={0} width={16} height={6} rx={3} fill={`url(#${bodyId})`} stroke={selected ? "var(--lab-accent, var(--accent))" : "#92400e"} strokeWidth={selected ? 2 : 1.2} />
      </g>
    </>
  );
}

export const PIECE_TYPES: PieceType[] = [
  { type: "pc", label: "PC", glyph: "🖥", color: "#34d399", width: 48, height: 36, renderBody: pcBody, terminals: [{ id: "port", dx: 0, dy: 18 }] },
  { type: "router", label: "Router", glyph: "⇄", color: "#38bdf8", width: 48, height: 36, renderBody: routerBody, terminals: [{ id: "port", dx: 0, dy: 18 }] },
  { type: "switch", label: "Switch", glyph: "▥", color: "#94a3b8", width: 48, height: 36, renderBody: switchBody, terminals: [{ id: "port", dx: 0, dy: 18 }] },
  { type: "firewall", label: "Firewall", glyph: "⛨", color: "#f87171", width: 48, height: 36, renderBody: firewallBody, terminals: [{ id: "port", dx: 0, dy: 18 }] },
  { type: "ap", label: "AP inalámbrico", glyph: "📶", color: "#fbbf24", width: 48, height: 36, renderBody: apBody, terminals: [{ id: "port", dx: 0, dy: 18 }] },
];

let counter = 1;
export function nextDeviceId(type: DeviceType): string {
  return `${type}${counter++}`;
}

export function defaultDevice(type: DeviceType, id: string): Device {
  switch (type) {
    case "pc":
    case "router":
    case "ap":
      return { id, type, ip: "10.0.0.2", prefix: 24, vlan_id: 1 };
    case "switch":
      return { id, type };
    case "firewall":
      return { id, type, default_action: "allow", rules: [] };
  }
}
