/**
 * Motor de topología de red — port 1:1 de apps/api/engines/networking/solver.py
 * para que corra en el navegador a cada cambio (sin ida y vuelta HTTP).
 *
 * Cálculo real, no animación: subnetting IPv4 con aritmética de 32 bits,
 * alcanzabilidad física por BFS sobre enlaces (con VLANs que cortan aristas)
 * y alcanzabilidad L3 que exige router en la ruta si las subredes difieren,
 * más firewalls con reglas ordenadas. Verificado contra el solver Python con
 * tools/golden/run.mjs (mismas escenas, mismo resultado).
 *
 * Extensión de esta versión: `packetTrace` deriva, a partir de la ruta ya
 * calculada, los encabezados que tendría un paquete ICMP en cada salto
 * (TTL decrementado por cada router, MAC de origen/destino por segmento L2).
 * No es emulación de protocolo: es la consecuencia determinista del mismo
 * modelo de grafo, mostrada salto a salto.
 */

export type DeviceType = "pc" | "router" | "switch" | "firewall" | "ap" | "server";

export interface FirewallRule { other_id: string; action: "allow" | "deny"; }

export interface Device {
  id: string;
  type: DeviceType;
  ip?: string | null;
  prefix?: number | null;
  vlan_id?: number;
  default_action?: "allow" | "deny";
  rules?: FirewallRule[];
}

export interface Link { a: string; b: string; link_type?: "copper" | "fiber" | "wireless"; }

export interface SubnetInfo {
  ip: string; prefix: number; network: string; broadcast: string; netmask: string;
  first_host: string | null; last_host: string | null; usable_hosts: number;
}

export interface ReachabilityPair {
  a: string; b: string; physically_connected: boolean; same_subnet: boolean;
  path: string[] | null; hops: number | null; l3_reachable: boolean; reason: string;
  blocked_by?: string | null;
}

export interface TopologyResult {
  ok: boolean;
  errors: string[];
  subnets: Record<string, SubnetInfo | null>;
  reachability: ReachabilityPair[];
}

const ENDPOINT_TYPES: DeviceType[] = ["pc", "router", "ap", "server"];
const isEndpoint = (d: Device) => ENDPOINT_TYPES.includes(d.type);

// ---------- IPv4 ----------
export function parseIPv4(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255 || (p.length > 1 && p.startsWith("0"))) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}
export const ipToString = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
export const maskOf = (prefix: number) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

export function subnetInfo(d: Device): SubnetInfo | null {
  if (!d.ip || d.prefix == null) return null;
  const ip = parseIPv4(d.ip);
  if (ip == null) return null;
  const mask = maskOf(d.prefix);
  const net = (ip & mask) >>> 0;
  const bcast = (net | (~mask >>> 0)) >>> 0;
  // Same convention as Python's ipaddress.hosts(): /31 and /32 have no
  // network/broadcast exclusion.
  let first: number | null, last: number | null, usable: number;
  if (d.prefix === 32) { first = net; last = net; usable = 1; }
  else if (d.prefix === 31) { first = net; last = bcast; usable = 2; }
  else { first = net + 1; last = bcast - 1; usable = Math.max(bcast - net - 1, 0); }
  return {
    ip: d.ip, prefix: d.prefix, network: ipToString(net), broadcast: ipToString(bcast), netmask: ipToString(mask),
    first_host: usable > 0 ? ipToString(first) : null, last_host: usable > 0 ? ipToString(last) : null, usable_hosts: usable,
  };
}

function networkKey(d: Device): string | null {
  if (!d.ip || d.prefix == null) return null;
  const ip = parseIPv4(d.ip);
  if (ip == null) return null;
  return `${(ip & maskOf(d.prefix)) >>> 0}/${d.prefix}`;
}

// ---------- validación ----------
export function validate(devices: Device[], links: Link[]): string[] {
  const errors: string[] = [];
  const ids = devices.map((d) => d.id);
  if (new Set(ids).size !== ids.length) errors.push("Hay IDs de dispositivo duplicados.");
  const seen: Record<string, string> = {};
  for (const d of devices) {
    if (isEndpoint(d)) {
      if (!d.ip || d.prefix == null) { errors.push(`'${d.id}' (${d.type}) necesita IP y prefijo de subred.`); continue; }
      if (parseIPv4(d.ip) == null || !(d.prefix >= 0 && d.prefix <= 32) || !Number.isInteger(d.prefix)) {
        errors.push(`IP/prefijo inválido en '${d.id}': ${d.ip}/${d.prefix}`); continue;
      }
      if (seen[d.ip]) errors.push(`IP duplicada ${d.ip} en '${d.id}' y '${seen[d.ip]}'.`);
      seen[d.ip] = d.id;
    }
    if (d.type === "firewall" && d.default_action && !["allow", "deny"].includes(d.default_action)) {
      errors.push(`Firewall '${d.id}': default_action debe ser 'allow' o 'deny'.`);
    }
  }
  const idSet = new Set(ids);
  for (const l of links) if (!idSet.has(l.a) || !idSet.has(l.b)) errors.push(`Enlace referencia un dispositivo inexistente: ${l.a}-${l.b}`);
  const linked = new Set(links.flatMap((l) => [l.a, l.b]));
  for (const d of devices) if (!linked.has(d.id)) errors.push(`'${d.id}' no tiene ningún enlace (dispositivo aislado).`);
  return errors;
}

// ---------- grafo ----------
function adjacency(byId: Map<string, Device>, links: Link[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const bridges: DeviceType[] = ["router", "firewall"];
  for (const l of links) {
    const a = byId.get(l.a), b = byId.get(l.b);
    if (!a || !b) continue;
    if (!bridges.includes(a.type) && !bridges.includes(b.type) && (a.vlan_id ?? 1) !== (b.vlan_id ?? 1)) continue;
    if (!adj.has(l.a)) adj.set(l.a, []);
    if (!adj.has(l.b)) adj.set(l.b, []);
    if (!adj.get(l.a)!.includes(l.b)) adj.get(l.a)!.push(l.b);
    if (!adj.get(l.b)!.includes(l.a)) adj.get(l.b)!.push(l.a);
  }
  return adj;
}

/** BFS: devuelve UNA ruta más corta en saltos. Python itera un set (orden no
 * determinista entre ejecuciones); aquí se itera en orden de inserción de
 * enlaces. Cuando hay varias rutas mínimas, la elegida puede diferir de la de
 * Python, pero su longitud y el veredicto de alcanzabilidad no. */
function bfsPath(adj: Map<string, string[]>, start: string, end: string): string[] | null {
  if (start === end) return [start];
  const visited = new Set([start]);
  const queue: string[][] = [[start]];
  while (queue.length) {
    const path = queue.shift()!;
    for (const nb of adj.get(path[path.length - 1]) ?? []) {
      if (visited.has(nb)) continue;
      const np = [...path, nb];
      if (nb === end) return np;
      visited.add(nb);
      queue.push(np);
    }
  }
  return null;
}

function firewallVerdict(byId: Map<string, Device>, path: string[], a: string, b: string): [boolean, string | null] {
  for (const id of path.slice(1, -1)) {
    const n = byId.get(id)!;
    if (n.type !== "firewall") continue;
    const rule = (n.rules ?? []).find((r) => r.other_id === a) ?? (n.rules ?? []).find((r) => r.other_id === b);
    const action = rule ? rule.action : n.default_action ?? "allow";
    if (action === "deny") return [false, id];
  }
  return [true, null];
}

export function evaluatePair(devices: Device[], links: Link[], a: string, b: string): ReachabilityPair {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const adj = adjacency(byId, links);
  const path = bfsPath(adj, a, b);
  const da = byId.get(a)!, db = byId.get(b)!;
  const ka = networkKey(da), kb = networkKey(db);
  const same = ka != null && kb != null && ka === kb;
  const hasRouter = !!path && path.slice(1, -1).some((n) => byId.get(n)!.type === "router");
  let fwOk = true, blocker: string | null = null;
  if (path) [fwOk, blocker] = firewallVerdict(byId, path, a, b);
  const l3 = !!path && (same || hasRouter) && fwOk;
  let reason: string;
  if (!path) reason = "sin enlace físico (o bloqueado por VLANs distintas sin router/firewall en el camino)";
  else if (!fwOk) reason = `bloqueado por firewall '${blocker}'`;
  else if (same) reason = "misma subred";
  else if (hasRouter) reason = "enrutado a través de router";
  else reason = "subredes distintas sin router en la ruta";
  return { a, b, physically_connected: !!path, same_subnet: same, path, hops: path ? path.length - 1 : null, l3_reachable: l3, reason, blocked_by: blocker };
}

export function runTopology(devices: Device[], links: Link[]): TopologyResult {
  const errors = validate(devices, links);
  const subnets: Record<string, SubnetInfo | null> = {};
  for (const d of devices) if (isEndpoint(d)) subnets[d.id] = subnetInfo(d);
  if (errors.length) return { ok: false, errors, subnets, reachability: [] };
  const eps = devices.filter(isEndpoint).map((d) => d.id);
  const reachability: ReachabilityPair[] = [];
  for (let i = 0; i < eps.length; i++) for (let j = i + 1; j < eps.length; j++) reachability.push(evaluatePair(devices, links, eps[i], eps[j]));
  return { ok: true, errors, subnets, reachability };
}

// ---------- traza de paquete ----------
export interface HopFrame {
  at: string;           // dispositivo que emite este tramo
  to: string;           // siguiente dispositivo
  ttl: number;          // TTL del paquete IP en este tramo
  l2_src: string;       // MAC lógica del emisor del segmento
  l2_dst: string;       // MAC lógica del siguiente salto L3 (o destino)
  vlan: number | null;  // etiqueta 802.1Q si el tramo es de acceso a VLAN != 1
  note: string;         // lo que ocurre en `to`
}
export interface PacketTrace {
  src_ip: string; dst_ip: string; protocol: "ICMP echo";
  delivered: boolean; stop_at: string | null; frames: HopFrame[]; pair: ReachabilityPair;
}

/** MAC lógica estable derivada del id (no es una MAC real asignada). */
export function logicalMac(id: string): string {
  let h = 2166136261;
  for (const c of id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const bytes = [0x02, (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255, id.length & 255];
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(":");
}

export function packetTrace(devices: Device[], links: Link[], a: string, b: string): PacketTrace | null {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const da = byId.get(a), db = byId.get(b);
  if (!da || !db) return null;
  const pair = evaluatePair(devices, links, a, b);
  const frames: HopFrame[] = [];
  let ttl = 64;
  const path = pair.path ?? [a];
  // Recorre la ruta; el paquete se detiene en el firewall que lo bloquea o,
  // si las subredes difieren y no hay router, en el último salto alcanzado.
  let stopAt: string | null = null;
  // siguiente salto L3 = próximo router/destino en la ruta
  const l3Next = (from: number) => {
    for (let k = from + 1; k < path.length; k++) { const t = byId.get(path[k])!.type; if (t === "router" || k === path.length - 1) return path[k]; }
    return path[path.length - 1];
  };
  let segSrc = a;
  for (let i = 0; i < path.length - 1; i++) {
    const at = path[i], to = path[i + 1];
    const atDev = byId.get(at)!, toDev = byId.get(to)!;
    if (atDev.type === "router" && i > 0) { ttl -= 1; segSrc = at; }
    const vlanOf = [atDev, toDev].find((d) => d.type === "pc" || d.type === "server" || d.type === "ap")?.vlan_id ?? 1;
    let note = "";
    if (toDev.type === "switch") note = "switch: reenvía la trama dentro de la VLAN";
    else if (toDev.type === "ap") note = "punto de acceso: puentea a la red cableada";
    else if (toDev.type === "router") note = `router: TTL ${ttl} → ${ttl - 1}, reescribe MACs`;
    else if (toDev.type === "firewall") {
      const blocked = pair.blocked_by === to;
      note = blocked ? "firewall: regla DENY — paquete descartado" : "firewall: regla ALLOW — continúa";
    } else if (i + 1 === path.length - 1) note = pair.l3_reachable ? "destino: responde ICMP echo-reply" : "destino inalcanzable en L3";
    frames.push({ at, to, ttl, l2_src: logicalMac(segSrc), l2_dst: logicalMac(l3Next(i)), vlan: vlanOf !== 1 ? vlanOf : null, note });
    if (toDev.type === "firewall" && pair.blocked_by === to) { stopAt = to; break; }
  }
  if (!pair.path) stopAt = a;
  else if (!pair.l3_reachable && !stopAt) {
    // subredes distintas sin router: el emisor ni siquiera tiene a quién
    // entregar el paquete (no hay gateway) → muere en el primer switch.
    stopAt = path.length > 1 ? path[1] : a;
    frames.splice(1);
    if (frames[0]) frames[0].note = "sin gateway: destino fuera de la subred y ningún router en la ruta";
  }
  return { src_ip: da.ip ?? "?", dst_ip: db.ip ?? "?", protocol: "ICMP echo", delivered: pair.l3_reachable, stop_at: stopAt, frames, pair };
}
