export type ComponentType = "resistor" | "dc_source" | "switch" | "capacitor" | "led";

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  node_a: string;
  node_b: string;
  value: number;
  closed?: boolean; // switch
  forward_voltage?: number; // led
  forward_resistance?: number; // led
}

export interface WireRecord {
  id: string;
  fromUid: string;
  fromTerminal: string;
  toUid: string;
  toTerminal: string;
}

export interface LayoutEntry {
  x: number;
  y: number;
  rotation?: number;
}

export interface CircuitScene {
  components: CircuitComponent[];
  wires?: WireRecord[];
  layout?: Record<string, LayoutEntry>;
}

export interface ComponentResult {
  id: string;
  type: ComponentType;
  voltage: number;
  current: number;
  power: number;
  closed?: boolean;
  on?: boolean;
}

export interface CircuitResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  node_voltages: Record<string, number>;
  components: ComponentResult[];
}
