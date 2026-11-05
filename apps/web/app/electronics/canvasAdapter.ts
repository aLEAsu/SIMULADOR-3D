import { PieceType, Piece, CanvasLink } from "../lib/InteractiveCanvas";
import { CircuitComponent, CircuitScene, ComponentType, WireRecord } from "./types";

export const GROUND_UID = "gnd-rail";

export const PIECE_TYPES: PieceType[] = [
  {
    type: "resistor", label: "Resistencia", glyph: "⟲R", color: "#fbbf24",
    width: 56, height: 28, rotatable: true,
    terminals: [{ id: "a", dx: -28, dy: 0, label: "a" }, { id: "b", dx: 28, dy: 0, label: "b" }],
  },
  {
    type: "dc_source", label: "Fuente DC", glyph: "+/−", color: "#38bdf8",
    width: 56, height: 28, rotatable: true,
    terminals: [{ id: "a", dx: -28, dy: 0, label: "+" }, { id: "b", dx: 28, dy: 0, label: "−" }],
  },
  {
    type: "switch", label: "Interruptor", glyph: "⏻", color: "#a78bfa",
    width: 56, height: 28, rotatable: true,
    terminals: [{ id: "a", dx: -28, dy: 0 }, { id: "b", dx: 28, dy: 0 }],
  },
  {
    type: "capacitor", label: "Capacitor", glyph: "||", color: "#34d399",
    width: 48, height: 28, rotatable: true,
    terminals: [{ id: "a", dx: -24, dy: 0 }, { id: "b", dx: 24, dy: 0 }],
  },
  {
    type: "led", label: "LED", glyph: "▷|", color: "#fb7185",
    width: 48, height: 28, rotatable: true,
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
