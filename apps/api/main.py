from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

import db
import tutor
from connection_manager import manager
from engines.agriculture.solver import GrowthModelError
from engines.chemistry.solver import TitrationError
from engines.electronics.solver import CircuitError
from engines.networking.solver import TopologyError
from engines.physics.solver import PhysicsError
from engines.registry import get_adapter, list_metadata
from engines.robotics.solver import KinematicsError

# Local (non-Docker) dev convenience: pick up a .env at the repo root
# (apps/api/main.py -> apps/api -> apps -> repo root). In Docker the
# directory is flattened to just /app, so there aren't 3 parents to
# climb — .parent chaining (unlike .parents[n]) can't raise there, it just
# bottoms out at "/", and the existence check below skips loading, which
# is correct: docker-compose already injects env vars directly.
_dotenv_path = Path(__file__).resolve().parent.parent.parent / ".env"
if _dotenv_path.exists():
    load_dotenv(_dotenv_path)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.connect()
    try:
        yield
    finally:
        await db.disconnect()


app = FastAPI(title="Universal Science Lab — Core API (MVP)", lifespan=lifespan)

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


class TutorQuestion(BaseModel):
    question: str


@app.get("/api/engines")
def engines_metadata():
    return list_metadata()


@app.get("/api/projects")
async def list_projects(discipline: str | None = None):
    return await db.list_projects(discipline)


@app.post("/api/projects")
async def create_project(body: ProjectCreate):
    try:
        get_adapter(body.discipline)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    return await db.create_project(body.name, body.discipline)


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    project = await db.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    return project


@app.put("/api/projects/{project_id}/scene")
async def save_scene(project_id: str, body: SceneIn):
    project = await db.save_scene(project_id, body.scene)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    await manager.broadcast(project_id, {"type": "scene_updated", "project": project})
    return project


@app.post("/api/projects/{project_id}/validate")
async def validate_experiment(project_id: str, body: SceneIn):
    project = await db.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    adapter = get_adapter(project["discipline"])
    return adapter.validate(body.scene)


@app.post("/api/projects/{project_id}/run")
async def run_experiment(project_id: str):
    project = await db.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    adapter = get_adapter(project["discipline"])
    try:
        result = adapter.run(project["scene"])
    except ENGINE_ERRORS as exc:
        raise HTTPException(422, str(exc)) from exc
    run_record = await db.append_run(project_id, project["scene"], result)
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


@app.post("/api/projects/{project_id}/tutor")
async def ask_tutor(project_id: str, body: TutorQuestion):
    project = await db.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    try:
        answer = await run_in_threadpool(tutor.ask, project, body.question)
    except tutor.TutorError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"answer": answer}


@app.get("/api/projects/{project_id}/runs")
async def list_runs(project_id: str):
    project = await db.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Proyecto no encontrado")
    return project["runs"]
