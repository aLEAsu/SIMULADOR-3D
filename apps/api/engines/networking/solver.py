"""Conceptual network topology solver.

Real computation (not an animated topology): IPv4 subnetting via the
Python stdlib `ipaddress` module, physical reachability via graph BFS over
links, and L3 reachability that requires a router on the path when two
devices sit in different subnets. This is deliberately NOT an emulation of
real device CLIs/OSes (see docs/00-discovery.md §6.1, distinction A vs C) —
it answers "is this addressing/topology correct", not "does a real Cisco
IOS process these packets".
"""
from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field


class TopologyError(ValueError):
    pass


@dataclass
class Device:
    id: str
    type: str  # "pc" | "router" | "switch"
    ip: str | None = None
    prefix: int | None = None  # CIDR prefix length, e.g. 24


@dataclass
class Link:
    a: str
    b: str


def validate(devices: list[Device], links: list[Link]) -> list[str]:
    errors: list[str] = []
    ids = [d.id for d in devices]
    if len(ids) != len(set(ids)):
        errors.append("Hay IDs de dispositivo duplicados.")

    seen_ips: dict[str, str] = {}
    for d in devices:
        if d.type in ("pc", "router"):
            if not d.ip or d.prefix is None:
                errors.append(f"'{d.id}' ({d.type}) necesita IP y prefijo de subred.")
                continue
            try:
                ipaddress.IPv4Interface(f"{d.ip}/{d.prefix}")
            except ValueError as exc:
                errors.append(f"IP/prefijo inválido en '{d.id}': {exc}")
                continue
            if d.ip in seen_ips:
                errors.append(f"IP duplicada {d.ip} en '{d.id}' y '{seen_ips[d.ip]}'.")
            seen_ips[d.ip] = d.id

    id_set = set(ids)
    for link in links:
        if link.a not in id_set or link.b not in id_set:
            errors.append(f"Enlace referencia un dispositivo inexistente: {link.a}-{link.b}")

    linked = {n for link in links for n in (link.a, link.b)}
    for d in devices:
        if d.id not in linked:
            errors.append(f"'{d.id}' no tiene ningún enlace (dispositivo aislado).")

    return errors


def _subnet_info(d: Device) -> dict | None:
    if not d.ip or d.prefix is None:
        return None
    iface = ipaddress.IPv4Interface(f"{d.ip}/{d.prefix}")
    net = iface.network
    hosts = list(net.hosts())
    return {
        "ip": d.ip,
        "prefix": d.prefix,
        "network": str(net.network_address),
        "broadcast": str(net.broadcast_address),
        "netmask": str(net.netmask),
        "first_host": str(hosts[0]) if hosts else None,
        "last_host": str(hosts[-1]) if hosts else None,
        "usable_hosts": max(len(hosts), 0),
    }


def _adjacency(links: list[Link]) -> dict[str, set[str]]:
    adj: dict[str, set[str]] = {}
    for link in links:
        adj.setdefault(link.a, set()).add(link.b)
        adj.setdefault(link.b, set()).add(link.a)
    return adj


def _bfs_path(adj: dict[str, set[str]], start: str, end: str) -> list[str] | None:
    if start == end:
        return [start]
    visited = {start}
    queue = [[start]]
    while queue:
        path = queue.pop(0)
        node = path[-1]
        for neighbor in adj.get(node, ()):
            if neighbor in visited:
                continue
            new_path = path + [neighbor]
            if neighbor == end:
                return new_path
            visited.add(neighbor)
            queue.append(new_path)
    return None


def run_topology(devices: list[Device], links: list[Link]) -> dict:
    errors = validate(devices, links)
    if errors:
        raise TopologyError("; ".join(errors))

    by_id = {d.id: d for d in devices}
    adj = _adjacency(links)
    subnets = {d.id: _subnet_info(d) for d in devices if d.type in ("pc", "router")}

    endpoints = [d.id for d in devices if d.type in ("pc", "router")]
    reachability = []
    for i, a in enumerate(endpoints):
        for b in endpoints[i + 1 :]:
            path = _bfs_path(adj, a, b)
            physically_connected = path is not None
            same_subnet = (
                subnets[a] is not None
                and subnets[b] is not None
                and ipaddress.IPv4Interface(f"{by_id[a].ip}/{by_id[a].prefix}").network
                == ipaddress.IPv4Interface(f"{by_id[b].ip}/{by_id[b].prefix}").network
            )
            has_router_on_path = bool(
                path and any(by_id[n].type == "router" for n in path[1:-1])
            )
            l3_reachable = physically_connected and (same_subnet or has_router_on_path)
            reachability.append({
                "a": a,
                "b": b,
                "physically_connected": physically_connected,
                "same_subnet": same_subnet,
                "path": path,
                "hops": (len(path) - 1) if path else None,
                "l3_reachable": l3_reachable,
                "reason": (
                    "sin enlace físico" if not physically_connected
                    else "misma subred" if same_subnet
                    else "enrutado a través de router" if has_router_on_path
                    else "subredes distintas sin router en la ruta"
                ),
            })

    return {"subnets": subnets, "reachability": reachability}
