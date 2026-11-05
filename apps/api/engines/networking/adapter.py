"""Networking engine adapter over the subnetting/reachability solver.

Fidelity level 2 (educativo cuantitativo): real IPv4 math and real graph
reachability, but no actual packet/protocol emulation (see
docs/00-discovery.md §6.1 distinction A/B/C). Do not present this as
"running" a real router OS — it is not.
"""
from __future__ import annotations

from . import solver

ADAPTER_METADATA = {
    "name": "networking-topology",
    "version": "0.1.0",
    "discipline": "networking",
    "fidelity_level": 2,
    "fidelity_label": "educativo cuantitativo (subnetting real + alcanzabilidad por grafo, sin emulación de SO real)",
    "supported_components": ["pc", "router", "switch"],
    "units": {"ip": "ipv4", "prefix": "bits CIDR"},
    "engine_license": "implementación propia (MIT del proyecto) sobre ipaddress de la librería estándar de Python",
}


def _to_devices(scene: dict) -> list[solver.Device]:
    return [solver.Device(**item) for item in scene.get("devices", [])]


def _to_links(scene: dict) -> list[solver.Link]:
    return [solver.Link(**item) for item in scene.get("links", [])]


def validate(scene: dict) -> dict:
    errors = solver.validate(_to_devices(scene), _to_links(scene))
    return {"ok": not errors, "errors": errors}


def run(scene: dict) -> dict:
    result = solver.run_topology(_to_devices(scene), _to_links(scene))
    return {
        "adapter": ADAPTER_METADATA["name"],
        "adapter_version": ADAPTER_METADATA["version"],
        "fidelity_level": ADAPTER_METADATA["fidelity_level"],
        **result,
    }
