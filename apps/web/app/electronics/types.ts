export type ComponentType = "resistor" | "dc_source";

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  node_a: string;
  node_b: string;
  value: number;
}

export interface CircuitScene {
  components: CircuitComponent[];
}

export interface ComponentResult {
  id: string;
  type: ComponentType;
  voltage: number;
  current: number;
  power: number;
}

export interface CircuitResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  node_voltages: Record<string, number>;
  components: ComponentResult[];
}
