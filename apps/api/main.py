from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import storage
from connection_manager import manager
from engines.agriculture.solver import GrowthModelError
from engines.chemistry.solver import TitrationError
from engines.electronics.solver import CircuitError
from engines.networking.solver import TopologyError
from engines.physics.solver import PhysicsError
from engines.registry import get_adapter, list_metadata
from engines.robotics.solver import KinematicsError

app = FastAPI(title="Universal Science Lab — Core API (MVP)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Domain errors raised by adapters are translated to HTTP 422 (not 500):
# they mean "the scene is scientifically/physically invalid", which is a
# client-correctable input error, not a server fault.
ENGINE_ERRORS = (CircuitError, TopologyError, GrowthModelError, PhysicsError, TitrationError, KinematicsError)


class ProjectCreate(BaseModel):
    name: str
    discipline: str


class SceneIn(BaseModel):
    scene: dict[str, Any]


@app.get("/api/engines")
def engines_metadata():
    return list_metadata()


@app.get("/api/projects")
def list_projects(discipline: str | None = None):
    return storage.list_projects(discipline)


@app.post("/api/projects")
def create_project(body: ProjectCreate):
    try:
        get_adapter(body.discipline)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    return storage.create_project(body.name, body.discipline)


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    project = storage.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    return project


@app.put("/api/projects/{project_id}/scene")
async def save_scene(project_id: str, body: SceneIn):
    project = storage.save_scene(project_id, body.scene)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    await manager.broadcast(project_id, {"type": "scene_updated", "project": project})
    return project


@app.post("/api/projects/{project_id}/validate")
def validate_experiment(project_id: str, body: SceneIn):
    project = storage.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    adapter = get_adapter(project["discipline"])
    return adapter.validate(body.scene)


@app.post("/api/projects/{project_id}/run")
async def run_experiment(project_id: str):
    project = storage.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    adapter = get_adapter(project["discipline"])
    try:
        result = adapter.run(project["scene"])
    except ENGINE_ERRORS as exc:
        raise HTTPException(422, str(exc)) from exc
    run_record = storage.append_run(project_id, project["scene"], result)
    await manager.broadcast(project_id, {"type": "run_added", "run": run_record})
    return run_record


@app.websocket("/ws/projects/{project_id}")
async def project_ws(websocket: WebSocket, project_id: str):
    await manager.connect(project_id, websocket)
    try:
        while True:
            # Clients don't need to send anything; this just detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(project_id, websocket)


@app.get("/api/projects/{project_id}/runs")
def list_runs(project_id: str):
    project = storage.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    return project["runs"]
