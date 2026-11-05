"""Planar robotic arm kinematics — real geometry (law of cosines + atan2),
not an animation. Standard textbook robotics model (e.g. Craig,
"Introduction to Robotics: Mechanics and Control"), independent of any
specific robot/manufacturer.

Two modes:

- 2-link (l3 is None): given link lengths l1, l2 and a target end-effector
  position (x, y), the classic closed-form solve:

      r = sqrt(x^2 + y^2)
      cos(theta2) = (r^2 - l1^2 - l2^2) / (2*l1*l2)        [law of cosines]
      theta2 = +-acos(cos_theta2)                          [elbow up/down]
      theta1 = atan2(y, x) - atan2(l2*sin(theta2), l1 + l2*cos(theta2))

- 3-link (l3 given): a 2-DOF position-only target under-determines 3
  joint angles (infinite solutions — redundant manipulator), so a 3-link
  arm also takes a desired end-effector *orientation* `target_phi_deg`.
  That makes it well-determined again: subtract link 3's own contribution
  to get the "wrist point" the first two links must reach, solve that
  with the exact same 2-link method above, then theta3 = phi - theta1 -
  theta2. This is the standard "decouple position and orientation"
  technique for a 3-DOF planar arm, not an approximation.

Both modes are verified by forward kinematics (recomputing the
end-effector position — and, for 3-link, orientation — from the solved
angles): the round-trip error must be numerically negligible, which is
the real correctness check, not a cosmetic animation.
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
    l3: float | None = None  # presence selects 3-link mode
    target_phi_deg: float | None = None  # required end-effector orientation when l3 is set


def validate(scene: ArmScene) -> list[str]:
    errors: list[str] = []
    if scene.l1 <= 0 or scene.l2 <= 0:
        errors.append("Las longitudes de los eslabones (l1, l2) deben ser > 0.")
    if scene.l3 is not None and scene.l3 <= 0:
        errors.append("La longitud del eslabón 3 (l3) debe ser > 0.")
    if scene.elbow not in ("up", "down"):
        errors.append("elbow debe ser 'up' o 'down'.")
    if scene.l3 is not None and scene.target_phi_deg is None:
        errors.append("Un brazo de 3 eslabones necesita target_phi_deg (orientación deseada del efector final): la posición sola no alcanza para 3 ángulos.")
    if errors:
        return errors

    if scene.l3 is None:
        wx, wy = scene.target_x, scene.target_y
    else:
        phi = math.radians(scene.target_phi_deg)  # type: ignore[arg-type]
        wx = scene.target_x - scene.l3 * math.cos(phi)
        wy = scene.target_y - scene.l3 * math.sin(phi)

    r = math.hypot(wx, wy)
    r_min = abs(scene.l1 - scene.l2)
    r_max = scene.l1 + scene.l2
    if not (r_min - 1e-9 <= r <= r_max + 1e-9):
        where = "del punto de muñeca (objetivo menos la contribución del eslabón 3)" if scene.l3 is not None else "del objetivo"
        errors.append(
            f"La distancia {where} está fuera del espacio de trabajo de l1+l2: "
            f"distancia={r:.4f}, alcance válido=[{r_min:.4f}, {r_max:.4f}]."
        )
    return errors


def _solve_2link(l1: float, l2: float, x: float, y: float, elbow: str) -> tuple[float, float]:
    """Core closed-form 2-link solve. Returns (theta1, theta2) in radians."""
    r = math.hypot(x, y)
    cos_t2 = (r ** 2 - l1 ** 2 - l2 ** 2) / (2 * l1 * l2)
    cos_t2 = max(-1.0, min(1.0, cos_t2))  # guard floating point at workspace boundary
    t2_mag = math.acos(cos_t2)
    theta2 = t2_mag if elbow == "up" else -t2_mag
    theta1 = math.atan2(y, x) - math.atan2(l2 * math.sin(theta2), l1 + l2 * math.cos(theta2))
    return theta1, theta2


def solve_arm(scene: ArmScene) -> dict:
    errors = validate(scene)
    if errors:
        raise KinematicsError("; ".join(errors))

    if scene.l3 is None:
        return _solve_2link_full(scene)
    return _solve_3link_full(scene)


def _solve_2link_full(scene: ArmScene) -> dict:
    x, y = scene.target_x, scene.target_y
    theta1, theta2 = _solve_2link(scene.l1, scene.l2, x, y, scene.elbow)

    joint1 = (scene.l1 * math.cos(theta1), scene.l1 * math.sin(theta1))
    end_effector = (
        joint1[0] + scene.l2 * math.cos(theta1 + theta2),
        joint1[1] + scene.l2 * math.sin(theta1 + theta2),
    )
    fk_error = math.hypot(end_effector[0] - x, end_effector[1] - y)

    return {
        "link_count": 2,
        "theta1_deg": math.degrees(theta1),
        "theta2_deg": math.degrees(theta2),
        "joint1": {"x": joint1[0], "y": joint1[1]},
        "end_effector": {"x": end_effector[0], "y": end_effector[1]},
        "target": {"x": x, "y": y},
        "fk_verification_error": fk_error,
        "workspace": {"r_min": abs(scene.l1 - scene.l2), "r_max": scene.l1 + scene.l2},
    }


def _solve_3link_full(scene: ArmScene) -> dict:
    x, y = scene.target_x, scene.target_y
    phi = math.radians(scene.target_phi_deg)  # type: ignore[arg-type]
    l3 = scene.l3  # type: ignore[assignment]
    wx = x - l3 * math.cos(phi)
    wy = y - l3 * math.sin(phi)

    theta1, theta2 = _solve_2link(scene.l1, scene.l2, wx, wy, scene.elbow)
    theta3 = phi - theta1 - theta2

    joint1 = (scene.l1 * math.cos(theta1), scene.l1 * math.sin(theta1))
    joint2 = (
        joint1[0] + scene.l2 * math.cos(theta1 + theta2),
        joint1[1] + scene.l2 * math.sin(theta1 + theta2),
    )
    end_effector = (
        joint2[0] + l3 * math.cos(theta1 + theta2 + theta3),
        joint2[1] + l3 * math.sin(theta1 + theta2 + theta3),
    )
    fk_pos_error = math.hypot(end_effector[0] - x, end_effector[1] - y)
    fk_phi_error = abs(((theta1 + theta2 + theta3 - phi + math.pi) % (2 * math.pi)) - math.pi)

    return {
        "link_count": 3,
        "theta1_deg": math.degrees(theta1),
        "theta2_deg": math.degrees(theta2),
        "theta3_deg": math.degrees(theta3),
        "joint1": {"x": joint1[0], "y": joint1[1]},
        "joint2": {"x": joint2[0], "y": joint2[1]},
        "end_effector": {"x": end_effector[0], "y": end_effector[1]},
        "target": {"x": x, "y": y},
        "target_phi_deg": scene.target_phi_deg,
        "fk_verification_error": fk_pos_error,
        "fk_orientation_error_deg": math.degrees(fk_phi_error),
        "workspace": {"r_min": abs(scene.l1 - scene.l2), "r_max": scene.l1 + scene.l2},
    }
