import { Device, Link, evaluatePair, packetTrace } from "../lib/engines/networking";

export interface NetDevice extends Device { label: string; pos: [number, number]; }
export interface NetScene { devices: NetDevice[]; links: Link[]; }

export interface Objective { id: string; text: string; check: (s: NetScene, pings: PingLog[]) => boolean; }
export interface PingLog { a: string; b: string; delivered: boolean; }

export interface Mission {
  id: string;
  code: string;
  title: string;
  brief: string[];
  scene: () => NetScene;
  keyPair: [string, string];
  predict: { question: string; choices: { id: string; label: string }[]; truth: (s: NetScene) => string };
  objectives: Objective[];
  hint: string;
  explain: { text: string[]; formula?: (s: NetScene) => string };
}

const pc = (id: string, label: string, ip: string, prefix: number, pos: [number, number], vlan = 1): NetDevice => ({ id, type: "pc", label, ip, prefix, pos, vlan_id: vlan });
const sw = (id: string, label: string, pos: [number, number]): NetDevice => ({ id, type: "switch", label, pos });
const reach = (s: NetScene, a: string, b: string) => evaluatePair(s.devices, s.links, a, b).l3_reachable;
const pinged = (p: PingLog[], a: string, b: string, delivered: boolean) => p.some((x) => ((x.a === a && x.b === b) || (x.a === b && x.b === a)) && x.delivered === delivered);

const bin = (ip: string) => ip.split(".").map((o) => Number(o).toString(2).padStart(8, "0")).join(".");
const maskBin = (p: number) => bin([24, 16, 8, 0].map((s) => (((p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0) >>> s) & 255)).join("."));

export const MISSIONS: Mission[] = [
  {
    id: "m1", code: "01", title: "Dominio de difusión",
    brief: [
      "Dos estaciones comparten un switch. Antes de tocar nada, decide si un ping de Ana llegará a Beto.",
      "Un switch reenvía tramas dentro de un mismo dominio L2; que el paquete IP sea entregado depende además de que ambos hosts estén en la misma red lógica.",
    ],
    scene: () => ({
      devices: [pc("ana", "Ana", "192.168.10.11", 24, [-2.4, 0.6]), pc("beto", "Beto", "192.168.10.12", 24, [2.4, 0.6]), sw("sw1", "SW-Core", [0, -0.8])],
      links: [{ a: "ana", b: "sw1" }, { a: "sw1", b: "beto" }],
    }),
    keyPair: ["ana", "beto"],
    predict: { question: "¿El ping de Ana (192.168.10.11/24) llega a Beto (192.168.10.12/24)?", choices: [{ id: "si", label: "Sí, llega" }, { id: "no", label: "No llega" }], truth: (s) => (reach(s, "ana", "beto") ? "si" : "no") },
    objectives: [{ id: "o1", text: "Envía un ping de Ana a Beto y obsérvalo atravesar el switch.", check: (_s, p) => pinged(p, "ana", "beto", true) }],
    hint: "Usa la herramienta Ping del dock (o el botón de la misión) y elige origen y destino.",
    explain: {
      text: ["Ambos hosts calculan la misma dirección de red al aplicar su máscara (AND bit a bit). Para el host emisor el destino es 'local': resuelve la MAC por ARP y entrega la trama directamente a través del switch, sin gateway."],
      formula: () => `  192.168.10.11  ${bin("192.168.10.11")}\nAND /24         ${maskBin(24)}\n= red          192.168.10.0\n  192.168.10.12  → misma red ⇒ entrega directa`,
    },
  },
  {
    id: "m2", code: "02", title: "La máscara engaña",
    brief: [
      "Mismo switch, mismos cables. Pero ahora los hosts usan /26.",
      "Tu reto: hacer que el ping llegue SIN añadir dispositivos ni cables. Solo puedes reconfigurar direcciones.",
    ],
    scene: () => ({
      devices: [pc("ana", "Ana", "10.0.0.5", 26, [-2.4, 0.6]), pc("beto", "Beto", "10.0.0.70", 26, [2.4, 0.6]), sw("sw1", "SW-Core", [0, -0.8])],
      links: [{ a: "ana", b: "sw1" }, { a: "sw1", b: "beto" }],
    }),
    keyPair: ["ana", "beto"],
    predict: { question: "Ana 10.0.0.5/26 y Beto 10.0.0.70/26 están en el mismo switch. ¿Llega el ping?", choices: [{ id: "si", label: "Sí, mismo switch" }, { id: "no", label: "No llega" }], truth: (s) => (reach(s, "ana", "beto") ? "si" : "no") },
    objectives: [
      { id: "o1", text: "Comprueba el fallo: envía el ping y mira dónde muere.", check: (_s, p) => pinged(p, "ana", "beto", false) },
      { id: "o2", text: "Reconfigura IP o prefijo para que lleguen (sin agregar equipos).", check: (s, p) => s.devices.length === 3 && s.links.length === 2 && reach(s, "ana", "beto") && pinged(p, "ana", "beto", true) },
    ],
    hint: "Abre la lente y mira los distritos de subred: /26 divide 10.0.0.0/24 en cuatro bloques de 64. ¿Qué prefijo une el bloque 0–63 con el 64–127?",
    explain: {
      text: ["Un /26 deja 6 bits de host (64 direcciones). 10.0.0.5 cae en el bloque 10.0.0.0–63 y 10.0.0.70 en 10.0.0.64–127: para cada host el otro es remoto, y sin gateway el paquete no sale. Con /25 (o moviendo una IP al mismo bloque) ambos calculan la misma red."],
      formula: (s) => {
        const a = s.devices.find((d) => d.id === "ana")!, b = s.devices.find((d) => d.id === "beto")!;
        return `Ana  ${bin(a.ip ?? "0.0.0.0")}\nBeto ${bin(b.ip ?? "0.0.0.0")}\n/${a.prefix}  ${maskBin(a.prefix ?? 0)}`;
      },
    },
  },
  {
    id: "m3", code: "03", title: "Cruzar subredes",
    brief: [
      "Dos laboratorios, dos subredes /24, un router desconectado en el rack.",
      "Cablea el router para que Ana (LAN 1) alcance a Carla (LAN 2). Antes, predice con qué TTL llegará el paquete.",
    ],
    scene: () => ({
      devices: [
        pc("ana", "Ana", "192.168.1.10", 24, [-4.2, 1.2]), pc("dani", "Dani", "192.168.1.11", 24, [-4.2, -1.6]), sw("sw1", "SW-LAN1", [-2.2, -0.2]),
        { id: "r1", type: "router", label: "R-Borde", ip: "192.168.1.1", prefix: 24, pos: [0, -2.4] },
        sw("sw2", "SW-LAN2", [2.2, -0.2]), pc("carla", "Carla", "192.168.2.20", 24, [4.2, 1.2]),
      ],
      links: [{ a: "ana", b: "sw1" }, { a: "dani", b: "sw1" }, { a: "carla", b: "sw2" }],
    }),
    keyPair: ["ana", "carla"],
    predict: {
      question: "Cuando Ana llegue a Carla a través de un router, ¿con qué TTL llegará el paquete (Ana emite TTL = 64)?",
      choices: [{ id: "64", label: "64" }, { id: "63", label: "63" }, { id: "62", label: "62" }],
      truth: () => "63",
    },
    objectives: [
      { id: "o1", text: "Conecta R-Borde con ambos switches (herramienta Cable).", check: (s) => ["sw1", "sw2"].every((x) => s.links.some((l) => (l.a === "r1" && l.b === x) || (l.b === "r1" && l.a === x))) },
      { id: "o2", text: "Haz llegar un ping de Ana a Carla.", check: (_s, p) => pinged(p, "ana", "carla", true) },
    ],
    hint: "Cable: toca el router y luego un switch. Repite con el otro. Después, Ping de Ana a Carla.",
    explain: {
      text: ["Al ser remoto el destino, Ana entrega la trama a la MAC del router (gateway). El router decrementa el TTL, consulta su tabla y reescribe las cabeceras L2 para el siguiente segmento: la IP de origen/destino se conserva, las MAC cambian salto a salto."],
      formula: (s) => {
        const t = packetTrace(s.devices, s.links, "ana", "carla");
        return t ? t.frames.map((f) => `${f.at.padEnd(6)}→ ${f.to.padEnd(6)} TTL ${f.ttl}`).join("\n") : "";
      },
    },
  },
  {
    id: "m4", code: "04", title: "Zona de invitados",
    brief: [
      "El servidor de notas está detrás de un firewall en 'permitir por defecto'.",
      "Política requerida: Oficina sí alcanza el servidor; Invitado no. Implementa la regla mínima.",
    ],
    scene: () => ({
      devices: [
        pc("ofi", "Oficina", "172.16.0.10", 24, [-3.6, 1.4]), pc("inv", "Invitado", "172.16.0.50", 24, [-3.6, -1.6]), sw("sw1", "SW-Acceso", [-1.6, -0.1]),
        { id: "fw", type: "firewall", label: "FW-Perímetro", default_action: "allow", rules: [], pos: [0.8, -0.1] },
        { id: "srv", type: "server", label: "Srv-Notas", ip: "172.16.0.200", prefix: 24, pos: [3.4, -0.1] },
      ],
      links: [{ a: "ofi", b: "sw1" }, { a: "inv", b: "sw1" }, { a: "sw1", b: "fw" }, { a: "fw", b: "srv" }],
    }),
    keyPair: ["inv", "srv"],
    predict: { question: "Con el firewall en 'permitir por defecto' y sin reglas, ¿el Invitado alcanza el servidor?", choices: [{ id: "si", label: "Sí" }, { id: "no", label: "No" }], truth: (s) => (reach(s, "inv", "srv") ? "si" : "no") },
    objectives: [
      { id: "o1", text: "Bloquea Invitado → Servidor con una regla en FW-Perímetro.", check: (s) => !reach(s, "inv", "srv") },
      { id: "o2", text: "Mantén Oficina → Servidor funcionando.", check: (s) => reach(s, "ofi", "srv") },
      { id: "o3", text: "Demuestra ambos con un ping cada uno.", check: (_s, p) => pinged(p, "inv", "srv", false) && pinged(p, "ofi", "srv", true) },
    ],
    hint: "Selecciona el firewall: en su ficha puedes añadir una regla DENY para 'Invitado'. No cambies la acción por defecto o romperás a Oficina.",
    explain: {
      text: ["Las reglas específicas (por origen) se evalúan antes que la acción por defecto. Una sola regla DENY para el invitado implementa la política con el mínimo privilegio sin afectar al resto del tráfico permitido."],
    },
  },
  {
    id: "free", code: "LIBRE", title: "Laboratorio libre",
    brief: ["Diseña tu propia red: añade equipos desde el dock, cablea, direcciona y prueba con pings. Con la lente activa verás subredes, VLANs y la matriz de alcance completa."],
    scene: () => ({ devices: [sw("sw1", "SW-1", [0, 0]), pc("pc1", "PC-1", "192.168.0.10", 24, [-2.2, 1]), pc("pc2", "PC-2", "192.168.0.20", 24, [2.2, 1])], links: [{ a: "pc1", b: "sw1" }, { a: "pc2", b: "sw1" }] }),
    keyPair: ["pc1", "pc2"],
    predict: { question: "¿Llega PC-1 a PC-2?", choices: [{ id: "si", label: "Sí" }, { id: "no", label: "No" }], truth: (s) => (reach(s, "pc1", "pc2") ? "si" : "no") },
    objectives: [],
    hint: "Atajos: V seleccionar · C cable · P ping · X cortar · Supr eliminar.",
    explain: { text: [] },
  },
];
