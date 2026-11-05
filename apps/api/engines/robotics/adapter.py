"""Robotics engine adapter over the 2-link planar arm kinematics solver.

Fidelity level 3 (científico): exact closed-form inverse kinematics,
verified by forward-kinematics round-trip. No dynamics (mass, torque,
motors) and no collision/physics engine — this is kinematics only.
Full-body robot dynamics (Webots vs MuJoCo) remains an open evaluation
per docs/02-roadmap.md Fase 5 and is deliberately out of scope here.
"""
from __future__ import annotations

from . import solver

ADAPTER_METADATA = {
    "name": "robotics-arm2-kinematics",
    "version": "0.1.0",
    "discipline": "robotics",
    "fidelity_level": 3,
    "fidelity_label": "cientifico (cinematica inversa exacta por ley de cosenos, verificada por cinematica directa; sin dinamica)",
    "supported_components": ["link1", "link2", "target"],
    "units": {"length": "m (o cualquier unidad consistente)", "angle": "grados"},
    "engine_license": "implementación propia (MIT del proyecto) sobre el modelo estándar de cinemática de brazos planares de 2 eslabones",
}


def _to_scene(scene: dict) -> solver.ArmScene:
    return solver.ArmScene(**scene)


def validate(scene: dict) -> dict:
    errors = solver.validate(_to_scene(scene))
    return {"ok": not errors, "errors": errors}


def run(scene: dict) -> dict:
    result = solver.solve_arm(_to_scene(scene))
    return {
        "adapter": ADAPTER_METADATA["name"],
        "adapter_version": ADAPTER_METADATA["version"],
        "fidelity_level": ADAPTER_METADATA["fidelity_level"],
        **result,
    }
