export type PhysicsMode = "point_mass" | "pendulum" | "incline";

export interface PhysicsScene {
  mode: PhysicsMode;
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
  pendulum_length: number;
  pendulum_theta0_deg: number;
  pendulum_omega0_deg_s: number;
  incline_angle_deg: number;
  incline_friction_mu: number;
  incline_s0: number;
  incline_v0: number;
}

export interface PhysicsSample {
  t: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  theta_deg?: number;
  omega_deg_s?: number;
  s?: number;
  v?: number;
  speed: number;
  kinetic_energy: number;
  potential_energy: number;
  total_energy: number;
}

export interface PhysicsBodyResult {
  label: string;
  series: PhysicsSample[];
  integrator: string;
  steps: number;
  dt: number;
}

export interface PhysicsResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  mode: PhysicsMode | "multi";
  series?: PhysicsSample[];
  integrator?: string;
  steps?: number;
  dt?: number;
  bodies?: PhysicsBodyResult[];
}
