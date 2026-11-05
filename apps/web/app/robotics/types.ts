export type Elbow = "up" | "down";

export interface ArmScene {
  l1: number;
  l2: number;
  target_x: number;
  target_y: number;
  elbow: Elbow;
  l3?: number | null;
  target_phi_deg?: number | null;
}

export interface Point {
  x: number;
  y: number;
}

export interface ArmResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  link_count: 2 | 3;
  theta1_deg: number;
  theta2_deg: number;
  theta3_deg?: number;
  joint1: Point;
  joint2?: Point;
  end_effector: Point;
  target: Point;
  target_phi_deg?: number;
  fk_verification_error: number;
  fk_orientation_error_deg?: number;
  workspace: { r_min: number; r_max: number };
}
