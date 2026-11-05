"""2-link planar robotic arm kinematics — real geometry (law of cosines +
atan2), not an animation. Standard textbook robotics model (e.g. Craig,
"Introduction to Robotics: Mechanics and Control"), independent of any
specific robot/manufacturer.

Given link lengths l1, l2 and a target end-effector position (x, y) in
the arm's base frame, solves inverse kinematics:

    r = sqrt(x^2 + y^2)
    cos(theta2) = (r^2 - l1^2 - l2^2) / (2*l1*l2)        [law of cosines]
    theta2 = +-acos(cos_theta2)                          [elbow up/down]
    theta1 = atan2(y, x) - atan2(l2*sin(theta2), l1 + l2*cos(theta2))

Then verifies by forward kinematics (recomputing the end-effector
position from the solved angles) — the round-trip error must be
numerically negligible, which is the real correctness check, not a
cosmetic animation.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


class KinematicsError(ValueError):
    pass


@dataclass
class ArmScene:
    l1: float
    l2: float
    target_x: float
    target_y: float
    elbow: str = "up"  # "up" | "down"


def validate(scene: ArmScene) -> list[str]:
    errors: list[str] = []
    if scene.l1 <= 0 or scene.l2 <= 0:
        errors.append("Las longitudes de los eslabones (l1, l2) deben ser > 0.")
    if scene.elbow not in ("up", "down"):
        errors.append("elbow debe ser 'up' o 'down'.")
    if errors:
        return errors

    r = math.hypot(scene.target_x, scene.target_y)
    r_min = abs(scene.l1 - scene.l2)
    r_max = scene.l1 + scene.l2
    if not (r_min - 1e-9 <= r <= r_max + 1e-9):
        errors.append(
            f"El objetivo ({scene.target_x}, {scene.target_y}) está fuera del espacio de trabajo: "
            f"distancia={r:.4f}, alcance válido=[{r_min:.4f}, {r_max:.4f}]."
        )
    return errors


def solve_arm(scene: ArmScene) -> dict:
    errors = validate(scene)
    if errors:
        raise KinematicsError("; ".join(errors))

    x, y = scene.target_x, scene.target_y
    r = math.hypot(x, y)
    cos_t2 = (r ** 2 - scene.l1 ** 2 - scene.l2 ** 2) / (2 * scene.l1 * scene.l2)
    cos_t2 = max(-1.0, min(1.0, cos_t2))  # guard floating point at workspace boundary
    t2_mag = math.acos(cos_t2)
    theta2 = t2_mag if scene.elbow == "up" else -t2_mag
    theta1 = math.atan2(y, x) - math.atan2(scene.l2 * math.sin(theta2), scene.l1 + scene.l2 * math.cos(theta2))

    # Forward kinematics verification from the solved angles.
    joint1 = (scene.l1 * math.cos(theta1), scene.l1 * math.sin(theta1))
    end_effector = (
        joint1[0] + scene.l2 * math.cos(theta1 + theta2),
        joint1[1] + scene.l2 * math.sin(theta1 + theta2),
    )
    fk_error = math.hypot(end_effector[0] - x, end_effector[1] - y)

    return {
        "theta1_deg": math.degrees(theta1),
        "theta2_deg": math.degrees(theta2),
        "joint1": {"x": joint1[0], "y": joint1[1]},
        "end_effector": {"x": end_effector[0], "y": end_effector[1]},
        "target": {"x": x, "y": y},
        "fk_verification_error": fk_error,
        "workspace": {"r_min": abs(scene.l1 - scene.l2), "r_max": scene.l1 + scene.l2},
    }
