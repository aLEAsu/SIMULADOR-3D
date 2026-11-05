export type Elbow = "up" | "down";

export interface ArmScene {
  l1: number;
  l2: number;
  target_x: number;
  target_y: number;
  elbow: Elbow;
}

export interface Point {
  x: number;
  y: number;
}

export interface ArmResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  theta1_deg: number;
  theta2_deg: number;
  joint1: Point;
  end_effector: Point;
  target: Point;
  fk_verification_error: number;
  workspace: { r_min: number; r_max: number };
}
