"use client";

/**
 * Shared 2D "workbench" canvas: drag pieces from a palette onto a grid,
 * move them, rotate them, wire two pieces together by dragging between
 * their terminals, select a piece to edit its properties, delete it with
 * visible feedback. Used by electronics (protoboard), networking
 * (topology), agriculture (plots) and chemistry (bench) — each lab owns
 * what a "piece" and a "link" *mean* (node ids, subnets, reagents); this
 * component only owns the drag/drop/connect geometry, as a fully
 * controlled component (host owns `pieces`/`links` state, this emits
 * intent events).
 *
 * Placement, moving and wiring all use plain mouse events (mousedown /
 * window-level mousemove+mouseup) instead of the HTML5 drag-and-drop API:
 * native DnD needs a real OS-level drag gesture that synthetic/automated
 * mouse input (and some touch setups) can't reliably trigger, so one
 * consistent mouse-tracking mechanism is used for all three gestures.
 */
import { useRef, useState } from "react";

export interface CanvasTerminal {
  id: string;
  dx: number;
  dy: number;
  label?: string;
}

export interface PieceType {
  type: string;
  label: string;
  glyph: string;
  color: string;
  width: number;
  height: number;
  terminals: CanvasTerminal[];
  rotatable?: boolean;
}

export interface Piece {
  uid: string;
  type: string;
  x: number;
  y: number;
  rotation?: number; // 0 | 90 | 180 | 270
  locked?: boolean;
  badge?: string;
  state?: "default" | "selected" | "good" | "bad";
}

export interface CanvasLink {
  id: string;
  fromUid: string;
  fromTerminal: string;
  toUid: string;
  toTerminal: string;
  label?: string;
  state?: "default" | "good" | "bad";
}

interface Props {
  pieceTypes: PieceType[];
  pieces: Piece[];
  links: CanvasLink[];
  selectedUid: string | null;
  width?: number;
  height?: number;
  gridSize?: number;
  allowLinks?: boolean;
  onPlace: (type: string, x: number, y: number) => void;
  onMove: (uid: string, x: number, y: number) => void;
  onRotate?: (uid: string) => void;
  onSelect: (uid: string | null) => void;
  onDelete: (uid: string) => void;
  onLink: (fromUid: string, fromTerminal: string, toUid: string, toTerminal: string) => void;
  onLinkDelete?: (linkId: string) => void;
}

function rotateOffset(dx: number, dy: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

function terminalWorldPos(piece: Piece, terminal: CanvasTerminal): [number, number] {
  const [dx, dy] = rotateOffset(terminal.dx, terminal.dy, piece.rotation ?? 0);
  return [piece.x + dx, piece.y + dy];
}

const STATE_COLOR: Record<string, string> = {
  default: "var(--border)",
  selected: "var(--accent)",
  good: "var(--good)",
  bad: "var(--bad)",
};

export default function InteractiveCanvas({
  pieceTypes, pieces, links, selectedUid,
  width = 640, height = 420, gridSize = 24, allowLinks = true,
  onPlace, onMove, onRotate, onSelect, onDelete, onLink, onLinkDelete,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [linking, setLinking] = useState<{ uid: string; terminal: string; x: number; y: number } | null>(null);
  const [placing, setPlacing] = useState<{ type: string; inside: boolean; x: number; y: number } | null>(null);
  const [hoverTerminal, setHoverTerminal] = useState<{ uid: string; terminal: string } | null>(null);

  const typeOf = (t: string) => pieceTypes.find((p) => p.type === t);

  function snap(v: number) {
    return Math.round(v / gridSize) * gridSize;
  }

  function toCanvasPoint(clientX: number, clientY: number): [number, number, boolean] {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0, false];
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    return [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY, inside];
  }

  // All three gestures below (place / move / link) register their
  // window-level mousemove+mouseup listeners *synchronously, inside the
  // mousedown handler itself* rather than in a `useEffect` reacting to
  // state. A `useEffect` only runs after React re-renders, which happens
  // asynchronously — a fast or programmatic drag can fire mousemove/mouseup
  // before that render happens, so the listener wouldn't exist yet and the
  // gesture would silently do nothing. Attaching imperatively in the same
  // call stack as mousedown closes that race.

  function handlePaletteMouseDown(type: string, e: React.MouseEvent) {
    e.preventDefault();
    const [x, y, inside] = toCanvasPoint(e.clientX, e.clientY);
    setPlacing({ type, x, y, inside });
    function handleWindowMove(ev: MouseEvent) {
      const [mx, my, minside] = toCanvasPoint(ev.clientX, ev.clientY);
      setPlacing((p) => (p ? { ...p, x: mx, y: my, inside: minside } : p));
    }
    function handleWindowUp(ev: MouseEvent) {
      const [mx, my, minside] = toCanvasPoint(ev.clientX, ev.clientY);
      if (minside) onPlace(type, snap(mx), snap(my));
      setPlacing(null);
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
    }
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
  }

  function handlePieceMouseDown(e: React.MouseEvent, piece: Piece) {
    e.preventDefault();
    e.stopPropagation();
    onSelect(piece.uid);
    if (piece.locked) return;
    const [startX, startY] = toCanvasPoint(e.clientX, e.clientY);
    const offset = { dx: piece.x - startX, dy: piece.y - startY };
    setDraggingUid(piece.uid);
    setDragOffset(offset);
    function handleWindowMove(ev: MouseEvent) {
      const [mx, my] = toCanvasPoint(ev.clientX, ev.clientY);
      onMove(piece.uid, snap(mx + offset.dx), snap(my + offset.dy));
    }
    function handleWindowUp() {
      setDraggingUid(null);
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
    }
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
  }

  function handleTerminalMouseDown(e: React.MouseEvent, uid: string, terminalId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!allowLinks) return;
    const [x, y] = toCanvasPoint(e.clientX, e.clientY);
    setLinking({ uid, terminal: terminalId, x, y });
    function handleWindowMove(ev: MouseEvent) {
      const [mx, my] = toCanvasPoint(ev.clientX, ev.clientY);
      setHoverTerminal(findTerminalNear(mx, my));
      setLinking((l) => (l ? { ...l, x: mx, y: my } : l));
    }
    function handleWindowUp(ev: MouseEvent) {
      const [mx, my] = toCanvasPoint(ev.clientX, ev.clientY);
      const target = findTerminalNear(mx, my);
      if (target && (target.uid !== uid || target.terminal !== terminalId)) {
        onLink(uid, terminalId, target.uid, target.terminal);
      }
      setLinking(null);
      setHoverTerminal(null);
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
    }
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
  }

  // Nearest terminal within a hit radius of a canvas point. Used to resolve
  // a link's drop target geometrically (not via hover/mouseenter state):
  // automated and touch input often fire mousedown+mouseup for a drag
  // without a real intermediate "enter" transition over the target
  // element, so relying on hover state to know what was dropped on is
  // unreliable — distance-based hit testing works regardless of how the
  // pointer events were produced.
  function findTerminalNear(x: number, y: number, radius = 14): { uid: string; terminal: string } | null {
    let best: { uid: string; terminal: string } | null = null;
    let bestDist = radius;
    for (const piece of pieces) {
      const pt = typeOf(piece.type);
      if (!pt) continue;
      for (const t of pt.terminals) {
        const [tx, ty] = terminalWorldPos(piece, t);
        const dist = Math.hypot(tx - x, ty - y);
        if (dist <= bestDist) {
          bestDist = dist;
          best = { uid: piece.uid, terminal: t.id };
        }
      }
    }
    return best;
  }

  const placingPieceType = placing ? typeOf(placing.type) : undefined;

  return (
    <div className="canvas-shell">
      <div className="canvas-palette">
        {pieceTypes.map((pt) => (
          <div
            key={pt.type}
            className="palette-piece"
            style={{ borderColor: pt.color }}
            onMouseDown={(e) => handlePaletteMouseDown(pt.type, e)}
            title={pt.label}
          >
            <span className="palette-glyph" style={{ color: pt.color }}>{pt.glyph}</span>
            <span className="palette-label">{pt.label}</span>
          </div>
        ))}
      </div>

      <svg
        ref={svgRef}
        className="canvas-surface"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        onClick={() => onSelect(null)}
      >
        <defs>
          <pattern id="usl-grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="var(--border)" opacity={0.6} />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#usl-grid)" />

        {links.map((link) => {
          const fromPiece = pieces.find((p) => p.uid === link.fromUid);
          const toPiece = pieces.find((p) => p.uid === link.toUid);
          if (!fromPiece || !toPiece) return null;
          const fromType = typeOf(fromPiece.type);
          const toType = typeOf(toPiece.type);
          const fromTerminal = fromType?.terminals.find((t) => t.id === link.fromTerminal);
          const toTerminal = toType?.terminals.find((t) => t.id === link.toTerminal);
          if (!fromType || !toType || !fromTerminal || !toTerminal) return null;
          const [x1, y1] = terminalWorldPos(fromPiece, fromTerminal);
          const [x2, y2] = terminalWorldPos(toPiece, toTerminal);
          return (
            <g key={link.id} className="canvas-link" onClick={(e) => { e.stopPropagation(); onLinkDelete?.(link.id); }}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STATE_COLOR[link.state ?? "default"]} strokeWidth={3} strokeLinecap="round" />
              {link.label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fontSize={10} fill="var(--muted)" textAnchor="middle">
                  {link.label}
                </text>
              )}
            </g>
          );
        })}

        {linking && (() => {
          const fromPiece = pieces.find((p) => p.uid === linking.uid);
          const fromTerminal = fromPiece ? typeOf(fromPiece.type)?.terminals.find((t) => t.id === linking.terminal) : undefined;
          if (!fromPiece || !fromTerminal) return null;
          const [x1, y1] = terminalWorldPos(fromPiece, fromTerminal);
          return <line x1={x1} y1={y1} x2={linking.x} y2={linking.y} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" />;
        })()}

        {pieces.map((piece) => {
          const pt = typeOf(piece.type);
          if (!pt) return null;
          const selected = piece.uid === selectedUid;
          const stroke = STATE_COLOR[selected ? "selected" : piece.state ?? "default"];
          return (
            <g
              key={piece.uid}
              transform={`translate(${piece.x},${piece.y}) rotate(${piece.rotation ?? 0})`}
              onMouseDown={(e) => handlePieceMouseDown(e, piece)}
              className={`canvas-piece${selected ? " is-selected" : ""}`}
              style={{ cursor: piece.locked ? "default" : "grab" }}
            >
              <rect
                x={-pt.width / 2} y={-pt.height / 2} width={pt.width} height={pt.height} rx={6}
                fill="#0b1220" stroke={stroke} strokeWidth={selected ? 2.5 : 1.5}
              />
              <text x={0} y={5} fontSize={16} textAnchor="middle" fill={pt.color} transform={`rotate(${-(piece.rotation ?? 0)})`}>
                {pt.glyph}
              </text>
              {piece.badge && (
                <text x={0} y={pt.height / 2 + 14} fontSize={10} textAnchor="middle" fill="var(--muted)" transform={`rotate(${-(piece.rotation ?? 0)})`}>
                  {piece.badge}
                </text>
              )}
              {pt.terminals.map((t) => (
                <circle
                  key={t.id}
                  cx={t.dx} cy={t.dy} r={6}
                  fill={hoverTerminal?.uid === piece.uid && hoverTerminal.terminal === t.id ? "var(--accent)" : "#0b1220"}
                  stroke="var(--accent)" strokeWidth={2}
                  onMouseDown={(e) => handleTerminalMouseDown(e, piece.uid, t.id)}
                  onMouseEnter={() => setHoverTerminal({ uid: piece.uid, terminal: t.id })}
                  onMouseLeave={() => setHoverTerminal((h) => (h?.uid === piece.uid && h.terminal === t.id ? null : h))}
                  style={{ cursor: allowLinks ? "crosshair" : "default" }}
                />
              ))}
              {selected && !piece.locked && (
                <g className="canvas-piece-toolbar" transform={`translate(0, ${-pt.height / 2 - 16}) rotate(${-(piece.rotation ?? 0)})`}>
                  {pt.rotatable && onRotate && (
                    <g onClick={(e) => { e.stopPropagation(); onRotate(piece.uid); }} transform="translate(-14,0)">
                      <circle r={9} fill="var(--panel)" stroke="var(--accent)" />
                      <text y={3} fontSize={10} textAnchor="middle" fill="var(--accent)">⟳</text>
                    </g>
                  )}
                  <g onClick={(e) => { e.stopPropagation(); onDelete(piece.uid); }} transform="translate(14,0)">
                    <circle r={9} fill="var(--panel)" stroke="var(--bad)" />
                    <text y={3} fontSize={10} textAnchor="middle" fill="var(--bad)">×</text>
                  </g>
                </g>
              )}
            </g>
          );
        })}

        {placing && placingPieceType && placing.inside && (
          <g transform={`translate(${snap(placing.x)},${snap(placing.y)})`} opacity={0.6} pointerEvents="none">
            <rect
              x={-placingPieceType.width / 2} y={-placingPieceType.height / 2}
              width={placingPieceType.width} height={placingPieceType.height} rx={6}
              fill="#0b1220" stroke="var(--lab-accent, var(--accent))" strokeDasharray="4 3" strokeWidth={2}
            />
            <text x={0} y={5} fontSize={16} textAnchor="middle" fill={placingPieceType.color}>{placingPieceType.glyph}</text>
          </g>
        )}
      </svg>
      <p className="canvas-hint">
        Arrastrá una pieza de la paleta al lienzo · arrastrá desde un terminal (círculo) a otro para conectar ·
        clic en una pieza para seleccionarla y editar sus valores · ⟳ rota, × elimina.
      </p>
    </div>
  );
}
