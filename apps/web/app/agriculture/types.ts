export interface DailyWeather {
  day: number;
  tmin: number;
  tmax: number;
}

export interface Thresholds {
  germination: number;
  flowering: number;
  maturity: number;
}

export interface GrowthScene {
  t_base: number;
  days: DailyWeather[];
  thresholds: Thresholds;
}

export interface GrowthSeriesPoint {
  day: number;
  gdd_day: number;
  gdd_accumulated: number;
}

export interface GrowthResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  series: GrowthSeriesPoint[];
  total_gdd: number;
  stage_reached_on_day: { germination: number | null; flowering: number | null; maturity: number | null };
  current_stage: string;
}
