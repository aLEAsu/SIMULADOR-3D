export interface PhysicsScene {
  mass: number;
  x0: number;
  y0: number;
  vx0: number;
  vy0: number;
  gravity_enabled: boolean;
  g: number;
  spring_enabled: boolean;
  spring_k: number;
  spring_anchor_x: number;
  spring_anchor_y: number;
  damping_enabled: boolean;
  damping_c: number;
  duration: number;
  dt: number;
}

export interface PhysicsSample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  kinetic_energy: number;
  potential_energy: number;
  total_energy: number;
}

export interface PhysicsResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  series: PhysicsSample[];
  integrator: string;
  steps: number;
  dt: number;
}
