export type DeviceType = "pc" | "router" | "switch";

export interface Device {
  id: string;
  type: DeviceType;
  ip?: string;
  prefix?: number;
}

export interface Link {
  a: string;
  b: string;
}

export interface TopologyScene {
  devices: Device[];
  links: Link[];
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
