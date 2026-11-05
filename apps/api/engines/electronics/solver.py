"""Modified Nodal Analysis (MNA) DC solver for the electronics adapter.

Real numerical solve (linear system via numpy), not an animation or
lookup table. Supports resistors, independent DC voltage sources,
switches, capacitors (DC steady state) and LEDs (piecewise-linear
diode model), referenced to a node literally named "gnd" (0 V).

LED handling: a real diode is nonlinear, so it cannot be captured by a
single linear solve. We use the standard piecewise-linear diode method
taught in intro circuits courses (e.g. Sedra/Smith): assume each LED is
either ON (forward-biased: acts as a fixed forward-voltage drop `Vf` in
series with a small ON resistance `Ron`) or OFF (reverse-biased: open
circuit), solve the resulting *linear* circuit for every combination of
assumed states, and keep the combination that is self-consistent (every
assumed-ON diode actually carries current >= 0, every assumed-OFF diode
actually sits at or below Vf). The "Vf in series with Ron" branch is
algebraically a Thevenin source, which has an exact Norton equivalent
(conductance 1/Ron plus an injected current Vf/Ron) — that Norton form
is what lets us stamp it into the same linear conductance matrix as a
resistor, with one extra RHS term. See apps/api/engines/electronics/
tests_manual.py for the hand-verified example.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import product

import numpy as np


class CircuitError(ValueError):
    pass


RESISTIVE_TYPES = {"resistor", "switch"}
OPEN_IN_DC_TYPES = {"capacitor"}

# Effective resistance used to model an ideal switch in a real (nonsingular)
# DC solve: a closed switch is not literally 0 ohm (that would make the
# conductance matrix singular for some topologies), so we use a very small
# but physically-plausible "on" resistance, and a very large "off"
# resistance — the same trick SPICE-class simulators use for switch models.
SWITCH_R_CLOSED = 1e-6
SWITCH_R_OPEN = 1e9


@dataclass
class Component:
    id: str
    type: str  # "resistor" | "dc_source" | "switch" | "capacitor" | "led"
    node_a: str
    node_b: str
    value: float  # ohms / volts / farads depending on type; ignored for led
    closed: bool = True  # switch only
    forward_voltage: float = 2.0  # led only (Vf, volts)
    forward_resistance: float = 10.0  # led only (Ron, ohms — small "on" slope resistance)


def _effective_resistance(c: Component) -> float:
    if c.type == "resistor":
        return c.value
    if c.type == "switch":
        return SWITCH_R_CLOSED if c.closed else SWITCH_R_OPEN
    raise ValueError(f"not a resistive type: {c.type}")


def validate(components: list[Component]) -> list[str]:
    errors: list[str] = []
    if not any(c.node_a == "gnd" or c.node_b == "gnd" for c in components):
        errors.append("No se definió un nodo de referencia 'gnd' conectado al circuito.")
    if not any(c.type == "dc_source" for c in components):
        errors.append("El circuito necesita al menos una fuente DC.")
    for c in components:
        if c.type == "resistor" and c.value <= 0:
            errors.append(f"Resistencia '{c.id}' debe ser > 0 ohm.")
        if c.type == "capacitor" and c.value <= 0:
            errors.append(f"Capacitor '{c.id}' debe ser > 0 F.")
        if c.type == "led" and (c.forward_voltage <= 0 or c.forward_resistance <= 0):
            errors.append(f"LED '{c.id}' necesita forward_voltage > 0 y forward_resistance > 0.")
        if c.node_a == c.node_b:
            errors.append(f"Componente '{c.id}' tiene el mismo nodo en ambos terminales.")

    # Connectivity check: every node must reach "gnd" through some component
    # that provides an actual DC path. Capacitors are open circuits at DC
    # steady state, so they are excluded here — a node reachable only
    # through capacitors has no real DC path to ground.
    adjacency: dict[str, set[str]] = {}
    for c in components:
        if c.type in OPEN_IN_DC_TYPES:
            continue
        adjacency.setdefault(c.node_a, set()).add(c.node_b)
        adjacency.setdefault(c.node_b, set()).add(c.node_a)
    all_nodes = {c.node_a for c in components} | {c.node_b for c in components}
    if "gnd" in all_nodes:
        seen = {"gnd"}
        frontier = ["gnd"]
        while frontier:
            node = frontier.pop()
            for neighbor in adjacency.get(node, ()):
                if neighbor not in seen:
                    seen.add(neighbor)
                    frontier.append(neighbor)
        floating = all_nodes - seen
        if floating:
            errors.append(f"Nodo(s) flotante(s), sin camino DC a 'gnd': {sorted(floating)}")
    return errors


def _solve_linear(
    nodes: list[str],
    node_index: dict[str, int],
    sources: list[Component],
    resistive: list[Component],
    led_branches: list[tuple[Component, bool]],
) -> np.ndarray:
    """One linear solve: resistive elements + sources + LEDs assumed in a
    fixed ON/OFF state. ON LEDs are stamped via their Norton equivalent
    (conductance 1/Ron + injected current Vf/Ron); OFF LEDs are skipped
    (open circuit, same as a capacitor)."""
    n = len(nodes)
    m = len(sources)
    size = n + m
    A = np.zeros((size, size))
    z = np.zeros(size)

    def stamp_conductance(a: str, b: str, g: float, rhs: float = 0.0) -> None:
        if a != "gnd":
            A[node_index[a], node_index[a]] += g
            z[node_index[a]] += rhs
        if b != "gnd":
            A[node_index[b], node_index[b]] += g
            z[node_index[b]] -= rhs
        if a != "gnd" and b != "gnd":
            A[node_index[a], node_index[b]] -= g
            A[node_index[b], node_index[a]] -= g

    for r in resistive:
        stamp_conductance(r.node_a, r.node_b, 1.0 / _effective_resistance(r))

    for led, on in led_branches:
        if not on:
            continue  # OFF LED = open circuit, no stamp
        g = 1.0 / led.forward_resistance
        stamp_conductance(led.node_a, led.node_b, g, rhs=led.forward_voltage * g)

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
        return np.linalg.solve(A, z)
    except np.linalg.LinAlgError as exc:
        raise CircuitError(f"Sistema sin solución única (circuito mal formado): {exc}") from exc


def run_dc(components: list[Component]) -> dict:
    errors = validate(components)
    if errors:
        raise CircuitError("; ".join(errors))

    # Parens matter: set `-` binds tighter than `|`, so without them "gnd"
    # could leak back in as a free node whenever it appeared as node_a.
    nodes = sorted(({c.node_a for c in components} | {c.node_b for c in components}) - {"gnd"})
    node_index = {name: i for i, name in enumerate(nodes)}
    n = len(nodes)

    sources = [c for c in components if c.type == "dc_source"]
    resistive = [c for c in components if c.type in RESISTIVE_TYPES]
    capacitors = [c for c in components if c.type == "capacitor"]
    leds = [c for c in components if c.type == "led"]
    m = len(sources)

    def voltage_of(x: np.ndarray, node: str) -> float:
        return 0.0 if node == "gnd" else float(x[node_index[node]])

    # Try every ON/OFF combination of LEDs (there are normally very few in
    # an educational circuit) and keep the first self-consistent one — this
    # is the standard piecewise-linear diode method, not a guess.
    x: np.ndarray | None = None
    chosen_states: dict[str, bool] = {}
    for combo in product([True, False], repeat=len(leds)):
        led_branches = list(zip(leds, combo))
        try:
            candidate = _solve_linear(nodes, node_index, sources, resistive, led_branches)
        except CircuitError:
            continue  # this ON/OFF combination makes the matrix singular; try the next one
        consistent = True
        for led, on in led_branches:
            v = voltage_of(candidate, led.node_a) - voltage_of(candidate, led.node_b)
            if on:
                i = (v - led.forward_voltage) / led.forward_resistance
                if i < -1e-9:
                    consistent = False
                    break
            else:
                if v > led.forward_voltage + 1e-9:
                    consistent = False
                    break
        if consistent:
            x = candidate
            chosen_states = {led.id: on for led, on in led_branches}
            break
    if x is None:
        raise CircuitError(
            "No se encontró un estado ON/OFF autoconsistente para los LED del circuito "
            "(revisá polaridad y valores — puede ser un circuito mal formado)."
        )

    node_voltages = {node: voltage_of(x, node) for node in nodes}
    node_voltages["gnd"] = 0.0

    component_results = []
    for r in [c for c in resistive if c.type == "resistor"]:
        v = voltage_of(x, r.node_a) - voltage_of(x, r.node_b)
        i = v / r.value
        component_results.append({"id": r.id, "type": "resistor", "voltage": v, "current": i, "power": v * i})
    for sw in [c for c in resistive if c.type == "switch"]:
        v = voltage_of(x, sw.node_a) - voltage_of(x, sw.node_b)
        i = v / _effective_resistance(sw)
        component_results.append({
            "id": sw.id, "type": "switch", "voltage": v, "current": i, "power": v * i,
            "closed": sw.closed,
        })
    for cap in capacitors:
        v = voltage_of(x, cap.node_a) - voltage_of(x, cap.node_b)
        component_results.append({"id": cap.id, "type": "capacitor", "voltage": v, "current": 0.0, "power": 0.0})
    for led in leds:
        on = chosen_states[led.id]
        v = voltage_of(x, led.node_a) - voltage_of(x, led.node_b)
        i = (v - led.forward_voltage) / led.forward_resistance if on else 0.0
        component_results.append({
            "id": led.id, "type": "led", "voltage": v, "current": max(i, 0.0),
            "power": v * max(i, 0.0), "on": on,
        })
    for k, s in enumerate(sources):
        i = float(x[n + k])
        v = voltage_of(x, s.node_a) - voltage_of(x, s.node_b)
        component_results.append({"id": s.id, "type": "dc_source", "voltage": v, "current": i, "power": v * i})

    return {"node_voltages": node_voltages, "components": component_results}
