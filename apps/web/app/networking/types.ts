export type DeviceType = "pc" | "router" | "switch" | "firewall" | "ap";
export type LinkType = "copper" | "fiber" | "wireless";

export interface FirewallRule {
  other_id: string;
  action: "allow" | "deny";
}

export interface Device {
  id: string;
  type: DeviceType;
  ip?: string;
  prefix?: number;
  vlan_id?: number;
  default_action?: "allow" | "deny";
  rules?: FirewallRule[];
}

export interface Link {
  a: string;
  b: string;
  link_type?: LinkType;
}

export interface LayoutEntry {
  x: number;
  y: number;
}

export interface TopologyScene {
  devices: Device[];
  links: Link[];
  layout?: Record<string, LayoutEntry>;
}

export interface SubnetInfo {
  ip: string;
  prefix: number;
  network: string;
  broadcast: string;
  netmask: string;
  first_host: string | null;
  last_host: string | null;
  usable_hosts: number;
}

export interface ReachabilityPair {
  a: string;
  b: string;
  physically_connected: boolean;
  same_subnet: boolean;
  path: string[] | null;
  hops: number | null;
  l3_reachable: boolean;
  reason: string;
}

export interface TopologyResult {
  adapter: string;
  adapter_version: string;
  fidelity_level: number;
  subnets: Record<string, SubnetInfo | null>;
  reachability: ReachabilityPair[];
}
