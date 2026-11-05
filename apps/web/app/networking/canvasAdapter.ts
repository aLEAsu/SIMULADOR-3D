import { PieceType } from "../lib/InteractiveCanvas";
import { Device, DeviceType } from "./types";

export const PIECE_TYPES: PieceType[] = [
  { type: "pc", label: "PC", glyph: "🖥", color: "#34d399", width: 48, height: 36, terminals: [{ id: "port", dx: 0, dy: 18 }] },
  { type: "router", label: "Router", glyph: "⇄", color: "#38bdf8", width: 48, height: 36, terminals: [{ id: "port", dx: 0, dy: 18 }] },
  { type: "switch", label: "Switch", glyph: "▥", color: "#94a3b8", width: 48, height: 36, terminals: [{ id: "port", dx: 0, dy: 18 }] },
  { type: "firewall", label: "Firewall", glyph: "⛨", color: "#f87171", width: 48, height: 36, terminals: [{ id: "port", dx: 0, dy: 18 }] },
  { type: "ap", label: "AP inalámbrico", glyph: "📶", color: "#fbbf24", width: 48, height: 36, terminals: [{ id: "port", dx: 0, dy: 18 }] },
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
