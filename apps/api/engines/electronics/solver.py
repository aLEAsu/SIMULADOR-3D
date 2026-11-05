"""Modified Nodal Analysis (MNA) DC solver for the electronics adapter.

Real numerical solve (linear system via numpy), not an animation or
lookup table. Supports resistors and independent DC voltage sources,
referenced to a node literally named "gnd" (0 V).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


class CircuitError(ValueError):
    pass


@dataclass
class Component:
    id: str
    type: str  # "resistor" | "dc_source"
    node_a: str
    node_b: str
    value: float  # ohms for resistor, volts for dc_source


def validate(components: list[Component]) -> list[str]:
    errors: list[str] = []
    if not any(c.node_a == "gnd" or c.node_b == "gnd" for c in components):
        errors.append("No se definió un nodo de referencia 'gnd' conectado al circuito.")
    if not any(c.type == "dc_source" for c in components):
        errors.append("El circuito necesita al menos una fuente DC.")
    for c in components:
        if c.type == "resistor" and c.value <= 0:
            errors.append(f"Resistencia '{c.id}' debe ser > 0 ohm.")
        if c.node_a == c.node_b:
            errors.append(f"Componente '{c.id}' tiene el mismo nodo en ambos terminales.")

    # Connectivity check: every node must reach "gnd" through some component.
    adjacency: dict[str, set[str]] = {}
    for c in components:
        adjacency.setdefault(c.node_a, set()).add(c.node_b)
        adjacency.setdefault(c.node_b, set()).add(c.node_a)
    if "gnd" in adjacency:
        seen = {"gnd"}
        frontier = ["gnd"]
        while frontier:
            node = frontier.pop()
            for neighbor in adjacency.get(node, ()):
                if neighbor not in seen:
                    seen.add(neighbor)
                    frontier.append(neighbor)
        floating = set(adjacency) - seen
        if floating:
            errors.append(f"Nodo(s) flotante(s), sin camino a 'gnd': {sorted(floating)}")
    return errors


def run_dc(components: list[Component]) -> dict:
    errors = validate(components)
    if errors:
        raise CircuitError("; ".join(errors))

    nodes = sorted({c.node_a for c in components} | {c.node_b for c in components} - {"gnd"})
    node_index = {name: i for i, name in enumerate(nodes)}
    n = len(nodes)

    sources = [c for c in components if c.type == "dc_source"]
    resistors = [c for c in components if c.type == "resistor"]
    m = len(sources)

    size = n + m
    A = np.zeros((size, size))
    z = np.zeros(size)

    for r in resistors:
        g = 1.0 / r.value
        a, b = r.node_a, r.node_b
        if a != "gnd":
            A[node_index[a], node_index[a]] += g
        if b != "gnd":
            A[node_index[b], node_index[b]] += g
        if a != "gnd" and b != "gnd":
            A[node_index[a], node_index[b]] -= g
            A[node_index[b], node_index[a]] -= g

    for k, s in enumerate(sources):
        row = n + k
        pos, neg = s.node_a, s.node_b
        if pos != "gnd":
            A[node_index[pos], row] += 1
            A[row, node_index[pos]] += 1
        if neg != "gnd":
            A[node_index[neg], row] -= 1
            A[row, node_index[neg]] -= 1
        z[row] = s.value

    try:
        x = np.linalg.solve(A, z)
    except np.linalg.LinAlgError as exc:
        raise CircuitError(f"Sistema sin solución única (circuito mal formado): {exc}") from exc

    def voltage(node: str) -> float:
        return 0.0 if node == "gnd" else float(x[node_index[node]])

    node_voltages = {node: voltage(node) for node in nodes}
    node_voltages["gnd"] = 0.0

    component_results = []
    for r in resistors:
        v = voltage(r.node_a) - voltage(r.node_b)
        i = v / r.value
        component_results.append({
            "id": r.id, "type": "resistor", "voltage": v, "current": i,
            "power": v * i,
        })
    for k, s in enumerate(sources):
        i = float(x[n + k])
        v = voltage(s.node_a) - voltage(s.node_b)
        component_results.append({
            "id": s.id, "type": "dc_source", "voltage": v, "current": i,
            "power": v * i,
        })

    return {"node_voltages": node_voltages, "components": component_results}
