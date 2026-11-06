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
import { ReactNode, useRef, useState } from "react";

export interface CanvasTerminal {
  id: string;
  dx: number;
  dy: number;
  label?: string;
}

/** Context passed to a `PieceType.renderBody` so it can draw a piece that
 * reacts to the same real state (selection, live result) the fallback
 * rect+glyph already reacts to — a custom body must never invent a state
 * the backend hasn't computed. */
export interface PieceRenderContext {
  piece: Piece;
  selected: boolean;
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
  /** Draw this piece's real geometry (resistor bands, LED dome, etc.)
   * instead of the generic rect+glyph placeholder. Receives the piece's
   * own local coordinate space (origin at its center, unrotated — the
   * caller already applies translate+rotate). Falls back to rect+glyph
   * when omitted, so labs that haven't migrated a piece type yet keep
   * working unchanged. */
  renderBody?: (ctx: PieceRenderContext) => ReactNode;
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
  /** Background texture of the grid. "breadboard" adds power-rail strips —
   * opt-in per lab so the shared component doesn't hardcode one discipline's
   * look. Defaults to the plain dot grid. */
  gridStyle?: "dots" | "breadboard" | "rack" | "field";
  /** Render the piece palette as a collapsible bar docked over the bottom
   * of the canvas instead of a separate row above it — an instrument's
   * toolbelt, not a row of form buttons competing with the workbench.
   * Defaults to the original inline-row layout so unmigrated labs are
   * unaffected. */
  paletteDocked?: boolean;
  /** True for the brief transient between "run pressed" and "result shown"
   * — purely a motion cue (current pulsing along the wires that are
   * already really connected), never a stand-in for a value the backend
   * hasn't returned yet. */
  energizing?: boolean;
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
  gridStyle = "dots", paletteDocked = false, energizing = false,
  onPlace, onMove, onRotate, onSelect, onDelete, onLink, onLinkDelete,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [linking, setLinking] = useState<{ uid: string; terminal: string; x: number; y: number } | null>(null);
  const [placing, setPlacing] = useState<{ type: string; inside: boolean; x: number; y: number } | null>(null);
  const [hoverTerminal, setHoverTerminal] = useState<{ uid: string; terminal: string } | null>(null);
  const [toolboxOpen, setToolboxOpen] = useState(true);

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

  const palette = (
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
  );

  return (
    <div className={`canvas-shell${paletteDocked ? " canvas-shell-docked" : ""}`}>
      {!paletteDocked && palette}

      <div className="canvas-surface-wrap">
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
            <radialGradient id="usl-hole-shade" cx="35%" cy="35%">
              <stop offset="0%" stopColor="#000" stopOpacity={0.15} />
              <stop offset="70%" stopColor="#000" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#000" stopOpacity={0.75} />
            </radialGradient>
            <radialGradient id="usl-vignette" cx="50%" cy="45%" r="75%">
              <stop offset="60%" stopColor="#000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000" stopOpacity={0.35} />
            </radialGradient>
          </defs>
          <rect width={width} height={height} fill="url(#usl-grid)" />
          {gridStyle === "breadboard" && (
            <>
              {/* power rails: real hole rows over a tinted strip, not a flat color band */}
              <rect x={0} y={0} width={width} height={18} fill="#7f1d1d" opacity={0.14} />
              <rect x={0} y={height - 18} width={width} height={18} fill="#1e3a8a" opacity={0.16} />
              <line x1={0} y1={6} x2={width} y2={6} stroke="#f87171" strokeWidth={1} opacity={0.55} />
              <line x1={0} y1={height - 6} x2={width} y2={height - 6} stroke="#60a5fa" strokeWidth={1} opacity={0.55} />
              {Array.from({ length: Math.floor(width / gridSize) }, (_, i) => {
                const cx = i * gridSize + gridSize / 2;
                return (
                  <g key={`rail-${i}`}>
                    <circle cx={cx} cy={9} r={2.2} fill="url(#usl-hole-shade)" />
                    <circle cx={cx} cy={height - 9} r={2.2} fill="url(#usl-hole-shade)" />
                  </g>
                );
              })}
              {/* board body: real perforation holes on the grid, not plain dots */}
              {Array.from({ length: Math.max(0, Math.floor(width / gridSize) - 1) }, (_, col) =>
                Array.from({ length: Math.max(0, Math.floor((height - 36) / gridSize)) }, (_, row) => (
                  <circle
                    key={`hole-${col}-${row}`}
                    cx={(col + 1) * gridSize}
                    cy={row * gridSize + 28}
                    r={2}
                    fill="url(#usl-hole-shade)"
                  />
                ))
              )}
              <rect width={width} height={height} fill="url(#usl-vignette)" pointerEvents="none" />
            </>
          )}
          {gridStyle === "rack" && (
            <>
              {/* 19" rack rails on both edges with real mounting holes, and
                  faint rack-unit band lines across the floor — a patch-panel
                  reads as infrastructure, not a blank canvas. */}
              <rect x={0} y={0} width={18} height={height} fill="#1e293b" opacity={0.5} />
              <rect x={width - 18} y={0} width={18} height={height} fill="#1e293b" opacity={0.5} />
              {Array.from({ length: Math.max(0, Math.floor(height / (gridSize * 1.5))) }, (_, i) => {
                const cy = i * gridSize * 1.5 + gridSize * 0.75;
                return (
                  <g key={`rackhole-${i}`}>
                    <circle cx={9} cy={cy} r={2.2} fill="url(#usl-hole-shade)" />
                    <circle cx={width - 9} cy={cy} r={2.2} fill="url(#usl-hole-shade)" />
                    <line x1={18} y1={cy + gridSize * 0.75} x2={width - 18} y2={cy + gridSize * 0.75} stroke="#34d399" strokeWidth={0.5} opacity={0.12} />
                  </g>
                );
              })}
              <rect width={width} height={height} fill="url(#usl-vignette)" pointerEvents="none" />
            </>
          )}
          {gridStyle === "field" && (
            <>
              {/* plowed furrow rows instead of a blank/dot field */}
              <rect x={0} y={0} width={width} height={height} fill="#2a1f12" opacity={0.35} />
              {Array.from({ length: Math.max(0, Math.ceil(height / (gridSize * 1.4))) }, (_, i) => {
                const rowY = i * gridSize * 1.4 + gridSize * 0.7;
                const amp = 4;
                let d = `M 0 ${rowY}`;
                for (let seg = 0; seg * gridSize < width; seg++) {
                  const cx = seg * gridSize + gridSize / 2;
                  const sign = seg % 2 === 0 ? -1 : 1;
                  d += ` Q ${cx} ${rowY + amp * sign} ${(seg + 1) * gridSize} ${rowY}`;
                }
                return <path key={`furrow-${i}`} d={d} fill="none" stroke="#5c4326" strokeWidth={1.5} opacity={0.4} />;
              })}
              <rect width={width} height={height} fill="url(#usl-vignette)" pointerEvents="none" />
            </>
          )}

          {energizing && (
            <defs>
              <linearGradient id="usl-sweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--lab-accent, var(--accent))" stopOpacity={0} />
                <stop offset="50%" stopColor="var(--lab-accent, var(--accent))" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--lab-accent, var(--accent))" stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          {energizing && (
            <rect y={0} x={-width * 0.4} width={width * 0.4} height={height} fill="url(#usl-sweep)" pointerEvents="none">
              <animate attributeName="x" from={-width * 0.4} to={width} dur="0.7s" repeatCount="indefinite" />
            </rect>
          )}

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
              {energizing && (
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="var(--lab-accent, var(--accent))" strokeWidth={3} strokeLinecap="round"
                  strokeDasharray="2 10" className="wire-pulse"
                />
              )}
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
              className={`canvas-piece${selected ? " is-selected" : ""}${piece.state === "good" ? " is-good" : ""}${energizing ? " is-energizing" : ""}`}
              style={{ cursor: piece.locked ? "default" : "grab" }}
            >
              {pt.renderBody ? (
                pt.renderBody({ piece, selected })
              ) : (
                <>
                  <rect
                    x={-pt.width / 2} y={-pt.height / 2} width={pt.width} height={pt.height} rx={6}
                    fill="#0b1220" stroke={stroke} strokeWidth={selected ? 2.5 : 1.5}
                  />
                  <text x={0} y={5} fontSize={16} textAnchor="middle" fill={pt.color} transform={`rotate(${-(piece.rotation ?? 0)})`}>
                    {pt.glyph}
                  </text>
                </>
              )}
              {piece.badge && (
                <text
                  x={0} y={pt.height / 2 + 14} fontSize={10} textAnchor="middle" fill="var(--muted)"
                  fontFamily="var(--font-mono)" transform={`rotate(${-(piece.rotation ?? 0)})`}
                >
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

        {paletteDocked && (
          <div className={`canvas-toolbox${toolboxOpen ? "" : " is-collapsed"}`}>
            <button type="button" className="toolbox-toggle" onClick={() => setToolboxOpen((v) => !v)}>
              {toolboxOpen ? "▾ Herramientas" : "▸ Herramientas"}
            </button>
            {toolboxOpen && palette}
          </div>
        )}
      </div>

      <p className="canvas-hint">
        Arrastrá una pieza de la paleta al lienzo · arrastrá desde un terminal (círculo) a otro para conectar ·
        clic en una pieza para seleccionarla y editar sus valores · ⟳ rota, × elimina.
      </p>
    </div>
  );
}
