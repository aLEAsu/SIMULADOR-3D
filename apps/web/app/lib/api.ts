const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface EngineMetadata {
  name: string;
  version: string;
  discipline: string;
  fidelity_level: number;
  fidelity_label: string;
  supported_components: string[];
  units: Record<string, string>;
  engine_license: string;
}

export interface Run<TResult = unknown> {
  id: string;
  scene: Record<string, unknown>;
  result: TResult;
}

export interface Project<TScene = Record<string, unknown>> {
  id: string;
  name: string;
  discipline: string;
  scene: TScene;
  runs: Run[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
  listEngines: () => request<EngineMetadata[]>("/api/engines"),
  createProject: (name: string, discipline: string) =>
    request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, discipline }),
    }),
  getProject: <TScene>(id: string) => request<Project<TScene>>(`/api/projects/${id}`),
  saveScene: (id: string, scene: Record<string, unknown>) =>
    request<Project>(`/api/projects/${id}/scene`, {
      method: "PUT",
      body: JSON.stringify({ scene }),
    }),
  validateScene: (id: string, scene: Record<string, unknown>) =>
    request<ValidationResult>(`/api/projects/${id}/validate`, {
      method: "POST",
      body: JSON.stringify({ scene }),
    }),
  runProject: <TResult = unknown>(id: string) =>
    request<Run<TResult>>(`/api/projects/${id}/run`, { method: "POST" }),
  listRuns: <TResult = unknown>(id: string) => request<Run<TResult>[]>(`/api/projects/${id}/runs`),
};
