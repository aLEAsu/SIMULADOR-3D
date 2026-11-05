export type AnalyteType = "acid" | "base";

export interface TitrationScene {
  analyte_type: AnalyteType;
  analyte_conc: number;
  analyte_volume: number;
  titrant_conc: number;
  max_titrant_volume: number;
  steps: number;
}

export interface TitrationPoint {
  titrant_volume: number;
  ph: number;
  total_volume: number;
}

export interface TitrationResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  series: TitrationPoint[];
  equivalence_volume: number;
  equivalence_in_range: boolean;
  kw: number;
}
