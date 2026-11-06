import { PieceType, Piece, CanvasLink, PieceRenderContext } from "../lib/InteractiveCanvas";
import { materialDefs } from "../lib/pieceMaterials";
import { CircuitComponent, CircuitScene, ComponentType, WireRecord } from "./types";

export const GROUND_UID = "gnd-rail";

/** Standard resistor digit color code (0–9). Real EIA-96 colors, not
 * decorative — used to derive the bands from the actual resistance value. */
const DIGIT_COLORS = [
  "#1c1c1c", // 0 black
  "#7a4a27", // 1 brown
  "#dc2626", // 2 red
  "#f97316", // 3 orange
  "#facc15", // 4 yellow
  "#16a34a", // 5 green
  "#2563eb", // 6 blue
  "#7c3aed", // 7 violet
  "#78716c", // 8 grey
  "#f8fafc", // 9 white
];
const TOLERANCE_GOLD = "#c9a227";

/** Derive the 4 real color bands (2 significant digits + multiplier +
 * tolerance) from a resistance value in ohms, using the same code printed
 * on real resistors — not a palette pick. 100 -> brown/black/brown,
 * 220 -> red/red/brown, 1000 -> brown/black/red, etc. */
export function resistorColorBands(value: number): [string, string, string, string] {
  let mantissa = Math.max(1, Math.round(Math.abs(value)));
  let exp = 0;
  while (mantissa >= 100) {
    mantissa = Math.round(mantissa / 10);
    exp++;
  }
  const d1 = Math.floor(mantissa / 10);
  const d2 = mantissa % 10;
  return [DIGIT_COLORS[d1] ?? DIGIT_COLORS[0], DIGIT_COLORS[d2] ?? DIGIT_COLORS[0], DIGIT_COLORS[Math.min(exp, 9)] ?? DIGIT_COLORS[0], TOLERANCE_GOLD];
}

/** Pieces on the canvas are plain `Piece` objects to InteractiveCanvas, but
 * each lab page actually spreads its own richer piece (with `props`) into
 * them — see electronics/page.tsx's `renderPieces`. A renderBody reads the
 * same real props the solver already validated, never a value it invents. */
function propsOf(piece: Piece): Partial<CircuitComponent> {
  return (piece as unknown as { props?: Partial<CircuitComponent> }).props ?? {};
}

function resistorBody({ piece, selected }: PieceRenderContext) {
  const value = propsOf(piece).value ?? 0;
  const [b1, b2, b3, b4] = resistorColorBands(value);
  const gradId = `res-grad-${piece.uid}`;
  const shadowId = `res-shadow-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0e2bd" />
          <stop offset="28%" stopColor="#e4d2a0" />
          <stop offset="55%" stopColor="#d9c493" />
          <stop offset="100%" stopColor="#b89a5c" />
        </linearGradient>
      </defs>
      <line x1={-28} y1={0} x2={-18} y2={0} stroke={leadStroke} strokeWidth={2} />
      <line x1={18} y1={0} x2={28} y2={0} stroke={leadStroke} strokeWidth={2} />
      <g filter={`url(#${shadowId})`}>
        <rect
          x={-18} y={-8} width={36} height={16} rx={8}
          fill={`url(#${gradId})`}
          stroke={selected ? "var(--lab-accent, var(--accent))" : "#8a713f"}
          strokeWidth={selected ? 2 : 1}
        />
        {/* specular highlight running along the cylinder's long axis */}
        <rect x={-16} y={-6.5} width={32} height={3} rx={1.5} fill="#fff" opacity={0.35} />
        <rect x={-11} y={-8} width={3} height={16} fill={b1} />
        <rect x={-5} y={-8} width={3} height={16} fill={b2} />
        <rect x={1} y={-8} width={3} height={16} fill={b3} />
        <rect x={10} y={-8} width={3} height={16} fill={b4} />
      </g>
    </>
  );
}

function dcSourceBody({ piece, selected }: PieceRenderContext) {
  const shadowId = `dc-shadow-${piece.uid}`;
  const plateGradId = `dc-plate-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <defs>
        <linearGradient id={plateGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="45%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <line x1={-28} y1={0} x2={-7} y2={0} stroke={leadStroke} strokeWidth={2} />
      <line x1={7} y1={0} x2={28} y2={0} stroke={leadStroke} strokeWidth={2} />
      {/* long thin plate = positive terminal, short thick plate = negative — real battery symbol */}
      <g filter={`url(#${shadowId})`}>
        <line x1={-7} y1={-11} x2={-7} y2={11} stroke={`url(#${plateGradId})`} strokeWidth={2.5} />
        <line x1={7} y1={-6} x2={7} y2={6} stroke={`url(#${plateGradId})`} strokeWidth={6} />
      </g>
      {selected && <rect x={-28} y={-15} width={56} height={30} rx={8} fill="none" stroke="var(--lab-accent, var(--accent))" strokeWidth={1.5} />}
    </>
  );
}

function capacitorBody({ piece, selected }: PieceRenderContext) {
  const shadowId = `cap-shadow-${piece.uid}`;
  const plateGradId = `cap-plate-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <defs>
        <linearGradient id={plateGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="50%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>
      <line x1={-24} y1={0} x2={-6} y2={0} stroke={leadStroke} strokeWidth={2} />
      <line x1={6} y1={0} x2={24} y2={0} stroke={leadStroke} strokeWidth={2} />
      {/* two parallel plates with a real gap between them — the gap is the component */}
      <g filter={`url(#${shadowId})`}>
        <rect x={-7} y={-10} width={3} height={20} fill={`url(#${plateGradId})`} />
        <rect x={4} y={-10} width={3} height={20} fill={`url(#${plateGradId})`} />
      </g>
      {selected && <rect x={-24} y={-15} width={48} height={30} rx={8} fill="none" stroke="var(--lab-accent, var(--accent))" strokeWidth={1.5} />}
    </>
  );
}

function switchBody({ piece, selected }: PieceRenderContext) {
  const closed = propsOf(piece).closed ?? true;
  const shadowId = `sw-shadow-${piece.uid}`;
  const leverEnd: [number, number] = closed ? [16, 0] : [11, -11];
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <line x1={-28} y1={0} x2={-16} y2={0} stroke={leadStroke} strokeWidth={2} />
      <line x1={16} y1={0} x2={28} y2={0} stroke={leadStroke} strokeWidth={2} />
      <circle cx={-16} cy={0} r={2.5} fill="#94a3b8" />
      <circle cx={16} cy={0} r={2.5} fill="#94a3b8" />
      <g filter={`url(#${shadowId})`}>
        <line
          x1={-16} y1={0} x2={leverEnd[0]} y2={leverEnd[1]}
          stroke={closed ? "var(--good)" : "var(--muted)"} strokeWidth={2.5} strokeLinecap="round"
        />
        <circle cx={-16} cy={0} r={3} fill={closed ? "var(--good)" : "var(--muted)"} />
      </g>
      {selected && <rect x={-28} y={-15} width={56} height={30} rx={8} fill="none" stroke="var(--lab-accent, var(--accent))" strokeWidth={1.5} />}
    </>
  );
}

function ledBody({ piece, selected }: PieceRenderContext) {
  const on = piece.state === "good"; // set by electronics/page.tsx from the real Run result (r.on), never guessed here
  const glowId = `led-glow-${piece.uid}`;
  const domeId = `led-dome-${piece.uid}`;
  const shadowId = `led-shadow-${piece.uid}`;
  const { defs, leadStroke } = materialDefs(piece.uid, shadowId);
  return (
    <>
      {defs}
      <line x1={-24} y1={0} x2={-9} y2={0} stroke={leadStroke} strokeWidth={2} />
      <line x1={9} y1={0} x2={24} y2={0} stroke={leadStroke} strokeWidth={2} />
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0%" stopColor="#fb7185" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={domeId} cx="35%" cy="30%">
          <stop offset="0%" stopColor={on ? "#fecdd3" : "#5b4047"} />
          <stop offset="55%" stopColor={on ? "#fb7185" : "#3f2730"} />
          <stop offset="100%" stopColor={on ? "#be123c" : "#271a1e"} />
        </radialGradient>
      </defs>
      {/* halo only exists when the real Run says this LED is on — neutral body otherwise */}
      <circle cx={0} cy={0} r={18} fill={`url(#${glowId})`} opacity={on ? 1 : 0} style={{ transition: "opacity var(--dur-slow) var(--ease-standard)" }} />
      <g filter={`url(#${shadowId})`}>
        <path d="M -9 -9 L 9 0 L -9 9 Z" fill={`url(#${domeId})`} stroke={on ? "#fecdd3" : "var(--border-strong)"} strokeWidth={1} />
        <line x1={9} y1={-8} x2={9} y2={8} stroke={on ? "#fecdd3" : "var(--border-strong)"} strokeWidth={2} />
      </g>
      {selected && <rect x={-24} y={-15} width={48} height={30} rx={8} fill="none" stroke="var(--lab-accent, var(--accent))" strokeWidth={1.5} />}
    </>
  );
}

export const PIECE_TYPES: PieceType[] = [
  {
    type: "resistor", label: "Resistencia", glyph: "⟲R", color: "#fbbf24",
    width: 56, height: 28, rotatable: true, renderBody: resistorBody,
    terminals: [{ id: "a", dx: -28, dy: 0, label: "a" }, { id: "b", dx: 28, dy: 0, label: "b" }],
  },
  {
    type: "dc_source", label: "Fuente DC", glyph: "+/−", color: "#38bdf8",
    width: 56, height: 28, rotatable: true, renderBody: dcSourceBody,
    terminals: [{ id: "a", dx: -28, dy: 0, label: "+" }, { id: "b", dx: 28, dy: 0, label: "−" }],
  },
  {
    type: "switch", label: "Interruptor", glyph: "⏻", color: "#a78bfa",
    width: 56, height: 28, rotatable: true, renderBody: switchBody,
    terminals: [{ id: "a", dx: -28, dy: 0 }, { id: "b", dx: 28, dy: 0 }],
  },
  {
    type: "capacitor", label: "Capacitor", glyph: "||", color: "#34d399",
    width: 48, height: 28, rotatable: true, renderBody: capacitorBody,
    terminals: [{ id: "a", dx: -24, dy: 0 }, { id: "b", dx: 24, dy: 0 }],
  },
  {
    type: "led", label: "LED", glyph: "▷|", color: "#fb7185",
    width: 48, height: 28, rotatable: true, renderBody: ledBody,
    terminals: [{ id: "a", dx: -24, dy: 0, label: "ánodo" }, { id: "b", dx: 24, dy: 0, label: "cátodo" }],
  },
];

export const GROUND_PIECE_TYPE: PieceType = {
  type: "ground", label: "Tierra (GND)", glyph: "⏚", color: "#94a3b8",
  width: 44, height: 44,
  terminals: [{ id: "g", dx: 0, dy: -22 }],
};

export function defaultProps(type: ComponentType): Partial<CircuitComponent> {
  switch (type) {
    case "resistor": return { value: 100 };
    case "dc_source": return { value: 10 };
    case "switch": return { value: 0, closed: true };
    case "capacitor": return { value: 1e-6 };
    case "led": return { value: 0, forward_voltage: 2.0, forward_resistance: 10 };
  }
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Derive solver node names (including "gnd") from pieces + wires by
 * union-find over terminal connections. A terminal that's transitively
 * wired to the ground piece becomes "gnd"; every other connected group
 * gets an auto-generated name n1, n2, ... in stable order. */
export function resolveNodes(pieces: Piece[], wires: WireRecord[]): Map<string, string> {
  const uf = new UnionFind();
  const key = (uid: string, terminal: string) => `${uid}:${terminal}`;
  for (const w of wires) uf.union(key(w.fromUid, w.fromTerminal), key(w.toUid, w.toTerminal));

  const groundKey = key(GROUND_UID, "g");
  const groundRoot = uf.find(groundKey);
  const rootNames = new Map<string, string>();
  rootNames.set(groundRoot, "gnd");
  let counter = 1;
  const terminalName = new Map<string, string>();

  const allTerminalKeys: string[] = [];
  for (const p of pieces) {
    if (p.type === "resistor" || p.type === "dc_source" || p.type === "switch" || p.type === "capacitor" || p.type === "led") {
      allTerminalKeys.push(key(p.uid, "a"), key(p.uid, "b"));
    }
  }
  for (const tk of allTerminalKeys) {
    const root = uf.find(tk);
    let name = rootNames.get(root);
    if (!name) {
      name = `n${counter++}`;
      rootNames.set(root, name);
    }
    terminalName.set(tk, name);
  }
  return terminalName;
}

export function sceneFromCanvas(pieces: Piece[], wires: WireRecord[]): CircuitScene {
  const nodeNames = resolveNodes(pieces, wires);
  const components: CircuitComponent[] = [];
  const layout: Record<string, { x: number; y: number; rotation?: number }> = {};
  for (const p of pieces) {
    layout[p.uid] = { x: p.x, y: p.y, rotation: p.rotation };
    if (p.type === "ground") continue;
    const props = (p as unknown as { props: Partial<CircuitComponent> }).props ?? {};
    components.push({
      id: p.uid,
      type: p.type as ComponentType,
      node_a: nodeNames.get(`${p.uid}:a`) ?? `${p.uid}_a`,
      node_b: nodeNames.get(`${p.uid}:b`) ?? `${p.uid}_b`,
      value: props.value ?? 0,
      ...(p.type === "switch" ? { closed: props.closed ?? true } : {}),
      ...(p.type === "led" ? { forward_voltage: props.forward_voltage ?? 2, forward_resistance: props.forward_resistance ?? 10 } : {}),
    });
  }
  return { components, wires, layout };
}

export interface CanvasPieceWithProps extends Piece {
  props: Partial<CircuitComponent>;
}

/** Reconstruct canvas pieces/wires from a saved scene. Scenes saved before
 * this canvas existed have no `layout`/`wires` — fall back to a generated
 * grid layout and synthesize wires by chaining components that share a
 * node name, so old projects still open (just re-laid-out once). */
export function canvasFromScene(scene: CircuitScene): { pieces: CanvasPieceWithProps[]; wires: WireRecord[] } {
  const hasLayout = !!scene.layout && Object.keys(scene.layout).length > 0;
  const pieces: CanvasPieceWithProps[] = [];
  const ground = scene.layout?.[GROUND_UID];
  pieces.push({ uid: GROUND_UID, type: "ground", x: ground?.x ?? 300, y: ground?.y ?? 360, locked: true, props: {} });

  scene.components.forEach((c, i) => {
    const pos = scene.layout?.[c.id];
    pieces.push({
      uid: c.id,
      type: c.type,
      x: pos?.x ?? 100 + (i % 4) * 130,
      y: pos?.y ?? 80 + Math.floor(i / 4) * 90,
      rotation: pos?.rotation ?? 0,
      props: {
        value: c.value, closed: c.closed,
        forward_voltage: c.forward_voltage, forward_resistance: c.forward_resistance,
      },
    });
  });

  let wires = scene.wires ?? [];
  if (!hasLayout || wires.length === 0) {
    // Synthesize wires by grouping components that already share a node
    // name (covers both legacy scenes and a from-scratch sample scene).
    const byNode = new Map<string, { uid: string; terminal: string }[]>();
    const add = (node: string, uid: string, terminal: string) => {
      if (!byNode.has(node)) byNode.set(node, []);
      byNode.get(node)!.push({ uid, terminal });
    };
    for (const c of scene.components) {
      add(c.node_a, c.id, "a");
      add(c.node_b, c.id, "b");
    }
    const synthesized: WireRecord[] = [];
    let wireCounter = 0;
    for (const [node, terms] of byNode) {
      if (node === "gnd") {
        for (const t of terms) {
          synthesized.push({ id: `w${wireCounter++}`, fromUid: GROUND_UID, fromTerminal: "g", toUid: t.uid, toTerminal: t.terminal });
        }
        continue;
      }
      for (let i = 1; i < terms.length; i++) {
        synthesized.push({ id: `w${wireCounter++}`, fromUid: terms[0].uid, fromTerminal: terms[0].terminal, toUid: terms[i].uid, toTerminal: terms[i].terminal });
      }
    }
    wires = synthesized;
  }
  return { pieces, wires };
}
