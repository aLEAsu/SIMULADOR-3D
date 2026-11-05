"""Conceptual network topology solver.

Real computation (not an animated topology): IPv4 subnetting via the
Python stdlib `ipaddress` module, physical reachability via graph BFS over
links, and L3 reachability that requires a router on the path when two
devices sit in different subnets. This is deliberately NOT an emulation of
real device CLIs/OSes (see docs/00-discovery.md §6.1, distinction A vs C) —
it answers "is this addressing/topology correct", not "does a real Cisco
IOS process these packets".

Two real extensions beyond basic subnetting + BFS, both affecting the
reachability computation itself (not just drawn on top of it):

- VLANs: each endpoint device carries a `vlan_id` (default 1). A switch
  only forwards a frame between two ports on the *same* VLAN — so a
  direct link between two endpoints in different VLANs does not conduct
  unless a router sits on it (routers bridge VLANs via sub-interfaces,
  i.e. "router-on-a-stick"). This changes which edges the BFS may use,
  not just a label.
- Firewalls: a "firewall" device type sitting on the path between two
  endpoints evaluates ordered allow/deny rules (by device id, with a
  default action) and can block L3 reachability outright, independent of
  subnet/router logic.
"""
from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field


class TopologyError(ValueError):
    pass


@dataclass
class FirewallRule:
    other_id: str
    action: str = "deny"  # "allow" | "deny"


@dataclass
class Device:
    id: str
    type: str  # "pc" | "router" | "switch" | "firewall" | "ap"
    ip: str | None = None
    prefix: int | None = None  # CIDR prefix length, e.g. 24
    vlan_id: int = 1
    default_action: str = "allow"  # firewall only
    rules: list[FirewallRule] = field(default_factory=list)  # firewall only


@dataclass
class Link:
    a: str
    b: str
    link_type: str = "copper"  # "copper" | "fiber" | "wireless" — informational, doesn't change reachability


def validate(devices: list[Device], links: list[Link]) -> list[str]:
    errors: list[str] = []
    ids = [d.id for d in devices]
    if len(ids) != len(set(ids)):
        errors.append("Hay IDs de dispositivo duplicados.")

    seen_ips: dict[str, str] = {}
    for d in devices:
        if d.type in ("pc", "router", "ap"):
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
        if d.type == "firewall" and d.default_action not in ("allow", "deny"):
            errors.append(f"Firewall '{d.id}': default_action debe ser 'allow' o 'deny'.")

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


def _adjacency(devices: list[Device], links: list[Link]) -> dict[str, set[str]]:
    by_id = {d.id: d for d in devices}
    adj: dict[str, set[str]] = {}
    for link in links:
        a, b = by_id[link.a], by_id[link.b]
        # A VLAN mismatch between two *endpoint* devices (pc/ap) blocks L2
        # forwarding on that edge unless a router or firewall sits on it
        # (switches/aps just forward within a VLAN; routers/firewalls are
        # the only things that legitimately bridge VLANs here).
        bridges = {"router", "firewall"}
        if a.type not in bridges and b.type not in bridges and a.vlan_id != b.vlan_id:
            continue
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


def _firewall_verdict(by_id: dict[str, Device], path: list[str], a: str, b: str) -> tuple[bool, str | None]:
    """Evaluate every firewall sitting on the path. The most specific rule
    (naming the other endpoint by id) overrides that firewall's default
    action; if ANY firewall on the path ends up denying, the pair is
    blocked regardless of subnet/router logic. Returns (allowed, blocking_firewall_id)."""
    for node_id in path[1:-1]:
        node = by_id[node_id]
        if node.type != "firewall":
            continue
        rule_for_a = next((r for r in node.rules if r.other_id == a), None)
        rule_for_b = next((r for r in node.rules if r.other_id == b), None)
        rule = rule_for_a or rule_for_b
        action = rule.action if rule else node.default_action
        if action == "deny":
            return False, node_id
    return True, None


def run_topology(devices: list[Device], links: list[Link]) -> dict:
    errors = validate(devices, links)
    if errors:
        raise TopologyError("; ".join(errors))

    by_id = {d.id: d for d in devices}
    adj = _adjacency(devices, links)
    subnets = {d.id: _subnet_info(d) for d in devices if d.type in ("pc", "router", "ap")}

    endpoints = [d.id for d in devices if d.type in ("pc", "router", "ap")]
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
            firewall_allowed, blocking_firewall = (True, None)
            if path:
                firewall_allowed, blocking_firewall = _firewall_verdict(by_id, path, a, b)
            l3_reachable = physically_connected and (same_subnet or has_router_on_path) and firewall_allowed
            if not physically_connected:
                reason = "sin enlace físico (o bloqueado por VLANs distintas sin router/firewall en el camino)"
            elif not firewall_allowed:
                reason = f"bloqueado por firewall '{blocking_firewall}'"
            elif same_subnet:
                reason = "misma subred"
            elif has_router_on_path:
                reason = "enrutado a través de router"
            else:
                reason = "subredes distintas sin router en la ruta"
            reachability.append({
                "a": a,
                "b": b,
                "physically_connected": physically_connected,
                "same_subnet": same_subnet,
                "path": path,
                "hops": (len(path) - 1) if path else None,
                "l3_reachable": l3_reachable,
                "reason": reason,
            })

    return {"subnets": subnets, "reachability": reachability}
