"""2D point-mass mechanics solver — real numerical integration (RK4), not
an animation. Models Newton's second law for a single point mass under:

    - gravity:  F_g = (0, -m*g)                         (optional, constant g)
    - a linear spring to a fixed anchor: F_s = -k * (r - r_anchor)   (Hooke's law)
    - linear (viscous) damping: F_d = -c * v

This is deliberately a single well-known textbook model (classical
mechanics, SHM, damped oscillators, projectile motion) — no invented
physics, no species/domain-specific constants. See docs/00-discovery.md
§6.3 and §9 (fidelity levels): this is fidelity level 3 ("científico"),
i.e. a real ODE solve against documented equations, not validated
against a specific physical experiment.
"""
from __future__ import annotations

from dataclasses import dataclass, field


class PhysicsError(ValueError):
    pass


@dataclass
class PhysicsScene:
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


def validate(scene: PhysicsScene) -> list[str]:
    errors: list[str] = []
    if scene.mass <= 0:
        errors.append("La masa debe ser > 0 kg.")
    if scene.duration <= 0:
        errors.append("La duración debe ser > 0 s.")
    if scene.dt <= 0 or scene.dt > scene.duration:
        errors.append("El paso de tiempo (dt) debe ser > 0 y menor que la duración.")
    if scene.spring_enabled and scene.spring_k < 0:
        errors.append("La constante del resorte (k) no puede ser negativa.")
    if scene.damping_enabled and scene.damping_c < 0:
        errors.append("El coeficiente de amortiguamiento (c) no puede ser negativo.")
    if (scene.duration / max(scene.dt, 1e-9)) > 200_000:
        errors.append("Demasiados pasos de integración para una corrida interactiva (duration/dt > 200000).")
    return errors


def _acceleration(scene: PhysicsScene, x: float, y: float, vx: float, vy: float) -> tuple[float, float]:
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
    return fx / scene.mass, fy / scene.mass


def _derivatives(scene: PhysicsScene, state: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x, y, vx, vy = state
    ax, ay = _acceleration(scene, x, y, vx, vy)
    return vx, vy, ax, ay


def run_mechanics(scene: PhysicsScene) -> dict:
    errors = validate(scene)
    if errors:
        raise PhysicsError("; ".join(errors))

    state = (scene.x0, scene.y0, scene.vx0, scene.vy0)
    t = 0.0
    dt = scene.dt
    series = [_sample(scene, 0.0, state)]

    steps = int(round(scene.duration / dt))
    for i in range(steps):
        k1 = _derivatives(scene, state)
        s2 = tuple(state[j] + dt / 2 * k1[j] for j in range(4))
        k2 = _derivatives(scene, s2)
        s3 = tuple(state[j] + dt / 2 * k2[j] for j in range(4))
        k3 = _derivatives(scene, s3)
        s4 = tuple(state[j] + dt * k3[j] for j in range(4))
        k4 = _derivatives(scene, s4)
        state = tuple(
            state[j] + dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) for j in range(4)
        )
        t = (i + 1) * dt
        series.append(_sample(scene, t, state))

    return {
        "series": series,
        "integrator": "RK4",
        "steps": steps,
        "dt": dt,
    }


def _sample(scene: PhysicsScene, t: float, state: tuple[float, float, float, float]) -> dict:
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
