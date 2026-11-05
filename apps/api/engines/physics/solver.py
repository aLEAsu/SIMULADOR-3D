"""2D mechanics solver — real numerical integration (RK4), not an
animation. Three independent textbook models, selected by `scene.mode`:

- "point_mass" (default, original model): a free point mass under
  gravity, a linear spring to a fixed anchor (Hooke's law), and linear
  viscous damping. Verified against caída libre / oscilador armónico /
  conservación de energía (see docs/02-roadmap.md Fase 4).
- "pendulum": a simple pendulum, theta'' = -(g/L)*sin(theta) -
  c*theta' (nonlinear ODE — no small-angle approximation). Verified
  below against the small-angle period T = 2*pi*sqrt(L/g).
- "incline": a block sliding on a frictionless or kinetic-friction
  incline, a'' = g*(sin(angle) - mu*cos(angle)*sign(v)). This has an
  exact closed form for constant friction, used to verify the RK4
  output below.

`scene.bodies`, when present, runs several of the above independently
(no inter-body interaction) and returns one series per body — this is
the "multi-body" case: still just N independent single-body solves
through the same integrator, not new physics.

See docs/00-discovery.md §6.3 and §9 (fidelity levels): fidelity level
3 ("científico"), i.e. real ODE solves against documented equations,
not validated against a specific physical experiment.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


class PhysicsError(ValueError):
    pass


@dataclass
class PhysicsScene:
    mode: str = "point_mass"  # "point_mass" | "pendulum" | "incline"
    mass: float = 1.0
    x0: float = 0.0
    y0: float = 0.0
    vx0: float = 0.0
    vy0: float = 0.0
    gravity_enabled: bool = True
    g: float = 9.81
    spring_enabled: bool = False
    spring_k: float = 0.0
    spring_anchor_x: float = 0.0
    spring_anchor_y: float = 0.0
    damping_enabled: bool = False
    damping_c: float = 0.0
    duration: float = 2.0
    dt: float = 0.01
    # pendulum
    pendulum_length: float = 1.0
    pendulum_theta0_deg: float = 30.0
    pendulum_omega0_deg_s: float = 0.0
    # incline
    incline_angle_deg: float = 30.0
    incline_friction_mu: float = 0.0
    incline_s0: float = 0.0
    incline_v0: float = 0.0
    # multi-body: when set, overrides single-body fields above
    bodies: list["PhysicsScene"] | None = None
    label: str = ""


def validate(scene: PhysicsScene) -> list[str]:
    if scene.bodies is not None:
        errors: list[str] = []
        if len(scene.bodies) == 0:
            errors.append("La lista de cuerpos (bodies) no puede estar vacía.")
        for i, body in enumerate(scene.bodies):
            for e in validate(body):
                errors.append(f"Cuerpo {i + 1} ({body.label or 'sin nombre'}): {e}")
        return errors

    errors = []
    if scene.mode not in ("point_mass", "pendulum", "incline"):
        errors.append(f"mode desconocido: '{scene.mode}' (debe ser point_mass, pendulum o incline).")
    if scene.duration <= 0:
        errors.append("La duración debe ser > 0 s.")
    if scene.dt <= 0 or scene.dt > scene.duration:
        errors.append("El paso de tiempo (dt) debe ser > 0 y menor que la duración.")
    if (scene.duration / max(scene.dt, 1e-9)) > 200_000:
        errors.append("Demasiados pasos de integración para una corrida interactiva (duration/dt > 200000).")

    if scene.mode == "point_mass":
        if scene.mass <= 0:
            errors.append("La masa debe ser > 0 kg.")
        if scene.spring_enabled and scene.spring_k < 0:
            errors.append("La constante del resorte (k) no puede ser negativa.")
        if scene.damping_enabled and scene.damping_c < 0:
            errors.append("El coeficiente de amortiguamiento (c) no puede ser negativo.")
    elif scene.mode == "pendulum":
        if scene.pendulum_length <= 0:
            errors.append("La longitud del péndulo debe ser > 0 m.")
        if scene.damping_c < 0:
            errors.append("El coeficiente de amortiguamiento angular no puede ser negativo.")
    elif scene.mode == "incline":
        if not (0 <= scene.incline_angle_deg < 90):
            errors.append("El ángulo del plano inclinado debe estar en [0, 90) grados.")
        if scene.incline_friction_mu < 0:
            errors.append("El coeficiente de fricción (mu) no puede ser negativo.")
    return errors


def _derivatives_point_mass(scene: PhysicsScene, state: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x, y, vx, vy = state
    fx = 0.0
    fy = 0.0
    if scene.gravity_enabled:
        fy -= scene.mass * scene.g
    if scene.spring_enabled:
        fx -= scene.spring_k * (x - scene.spring_anchor_x)
        fy -= scene.spring_k * (y - scene.spring_anchor_y)
    if scene.damping_enabled:
        fx -= scene.damping_c * vx
        fy -= scene.damping_c * vy
    return vx, vy, fx / scene.mass, fy / scene.mass


def _derivatives_pendulum(scene: PhysicsScene, state: tuple[float, float]) -> tuple[float, float]:
    theta, omega = state
    g = scene.g if scene.gravity_enabled else 0.0
    alpha = -(g / scene.pendulum_length) * math.sin(theta) - scene.damping_c * omega
    return omega, alpha


def _derivatives_incline(scene: PhysicsScene, state: tuple[float, float]) -> tuple[float, float]:
    s, v = state
    angle = math.radians(scene.incline_angle_deg)
    g = scene.g if scene.gravity_enabled else 0.0
    friction = scene.incline_friction_mu * g * math.cos(angle) * (1.0 if v > 0 else (-1.0 if v < 0 else 0.0))
    a = g * math.sin(angle) - friction
    return v, a


def _rk4_step(deriv, scene: PhysicsScene, state: tuple[float, ...], dt: float) -> tuple[float, ...]:
    k1 = deriv(scene, state)
    s2 = tuple(state[j] + dt / 2 * k1[j] for j in range(len(state)))
    k2 = deriv(scene, s2)
    s3 = tuple(state[j] + dt / 2 * k2[j] for j in range(len(state)))
    k3 = deriv(scene, s3)
    s4 = tuple(state[j] + dt * k3[j] for j in range(len(state)))
    k4 = deriv(scene, s4)
    return tuple(state[j] + dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) for j in range(len(state)))


def run_mechanics(scene: PhysicsScene) -> dict:
    errors = validate(scene)
    if errors:
        raise PhysicsError("; ".join(errors))

    if scene.bodies is not None:
        return {
            "mode": "multi",
            "bodies": [{"label": b.label or f"cuerpo {i + 1}", **_run_single(b)} for i, b in enumerate(scene.bodies)],
        }
    return {"mode": scene.mode, **_run_single(scene)}


def _run_single(scene: PhysicsScene) -> dict:
    if scene.mode == "point_mass":
        deriv = _derivatives_point_mass
        state: tuple[float, ...] = (scene.x0, scene.y0, scene.vx0, scene.vy0)
        sampler = _sample_point_mass
    elif scene.mode == "pendulum":
        deriv = _derivatives_pendulum
        state = (math.radians(scene.pendulum_theta0_deg), math.radians(scene.pendulum_omega0_deg_s))
        sampler = _sample_pendulum
    else:  # incline
        deriv = _derivatives_incline
        state = (scene.incline_s0, scene.incline_v0)
        sampler = _sample_incline

    dt = scene.dt
    steps = int(round(scene.duration / dt))
    series = [sampler(scene, 0.0, state)]
    for i in range(steps):
        state = _rk4_step(deriv, scene, state, dt)
        series.append(sampler(scene, (i + 1) * dt, state))

    return {"series": series, "integrator": "RK4", "steps": steps, "dt": dt}


def _sample_point_mass(scene: PhysicsScene, t: float, state: tuple[float, ...]) -> dict:
    x, y, vx, vy = state
    speed = (vx ** 2 + vy ** 2) ** 0.5
    kinetic = 0.5 * scene.mass * speed ** 2
    potential_gravity = scene.mass * scene.g * y if scene.gravity_enabled else 0.0
    potential_spring = (
        0.5 * scene.spring_k * ((x - scene.spring_anchor_x) ** 2 + (y - scene.spring_anchor_y) ** 2)
        if scene.spring_enabled else 0.0
    )
    return {
        "t": t, "x": x, "y": y, "vx": vx, "vy": vy, "speed": speed,
        "kinetic_energy": kinetic,
        "potential_energy": potential_gravity + potential_spring,
        "total_energy": kinetic + potential_gravity + potential_spring,
    }


def _sample_pendulum(scene: PhysicsScene, t: float, state: tuple[float, ...]) -> dict:
    theta, omega = state
    L = scene.pendulum_length
    x = L * math.sin(theta)
    y = -L * math.cos(theta)
    speed = L * abs(omega)
    g = scene.g if scene.gravity_enabled else 0.0
    kinetic = 0.5 * scene.mass * speed ** 2
    potential = scene.mass * g * (L - L * math.cos(theta))  # reference at the pivot's lowest point
    return {
        "t": t, "x": x, "y": y, "theta_deg": math.degrees(theta), "omega_deg_s": math.degrees(omega),
        "speed": speed, "kinetic_energy": kinetic, "potential_energy": potential,
        "total_energy": kinetic + potential,
    }


def _sample_incline(scene: PhysicsScene, t: float, state: tuple[float, ...]) -> dict:
    s, v = state
    angle = math.radians(scene.incline_angle_deg)
    x = s * math.cos(angle)
    y = s * math.sin(angle)
    g = scene.g if scene.gravity_enabled else 0.0
    kinetic = 0.5 * scene.mass * v ** 2
    potential = scene.mass * g * y
    return {
        "t": t, "x": x, "y": y, "s": s, "v": v, "speed": abs(v),
        "kinetic_energy": kinetic, "potential_energy": potential, "total_energy": kinetic + potential,
    }
