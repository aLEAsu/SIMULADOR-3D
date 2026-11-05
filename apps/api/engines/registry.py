"""Registry of engine adapters by discipline.

This is the one place the núcleo universal needs to touch to learn about a
new discipline — adding a lab means adding one entry here, not changing
any route or storage code (docs/01-architecture.md §2).
"""
from __future__ import annotations

from engines.agriculture import adapter as agriculture_adapter
from engines.chemistry import adapter as chemistry_adapter
from engines.electronics import adapter as electronics_adapter
from engines.networking import adapter as networking_adapter
from engines.physics import adapter as physics_adapter
from engines.robotics import adapter as robotics_adapter

ADAPTERS = {
    "electronics": electronics_adapter,
    "networking": networking_adapter,
    "agriculture": agriculture_adapter,
    "physics": physics_adapter,
    "chemistry": chemistry_adapter,
    "robotics": robotics_adapter,
}


def get_adapter(discipline: str):
    adapter = ADAPTERS.get(discipline)
    if adapter is None:
        raise KeyError(f"No hay adaptador registrado para la disciplina '{discipline}'.")
    return adapter


def list_metadata() -> list[dict]:
    return [a.ADAPTER_METADATA for a in ADAPTERS.values()]
