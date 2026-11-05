"""Persistence for the MVP.

MVP placeholder: JSON file on disk. docs/01-architecture.md specifies
PostgreSQL for the real núcleo universal; this file-backed store exists
only to make the labs demonstrable end-to-end without standing up a
database server first. Swap for a real Postgres-backed repository in
Fase 2b/7 without changing the API routes that call this module.

Generic across disciplines: a project's "scene" is an opaque dict whose
shape is defined by the engine adapter for that project's discipline
(see engines/registry.py), not by this module.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from threading import Lock

DATA_FILE = Path(__file__).parent / "data" / "projects.json"
_lock = Lock()


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"projects": {}}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def _save(data: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def list_projects(discipline: str | None = None) -> list[dict]:
    with _lock:
        data = _load()
        items = [{"id": pid, **p} for pid, p in data["projects"].items()]
    if discipline:
        items = [p for p in items if p["discipline"] == discipline]
    return [
        {"id": p["id"], "name": p["name"], "discipline": p["discipline"], "run_count": len(p["runs"])}
        for p in items
    ]


def create_project(name: str, discipline: str) -> dict:
    with _lock:
        data = _load()
        pid = str(uuid.uuid4())
        data["projects"][pid] = {"name": name, "discipline": discipline, "scene": {}, "runs": []}
        _save(data)
        return {"id": pid, **data["projects"][pid]}


def get_project(project_id: str) -> dict | None:
    with _lock:
        data = _load()
        project = data["projects"].get(project_id)
        if project is None:
            return None
        return {"id": project_id, **project}


def save_scene(project_id: str, scene: dict) -> dict | None:
    with _lock:
        data = _load()
        project = data["projects"].get(project_id)
        if project is None:
            return None
        project["scene"] = scene
        _save(data)
        return {"id": project_id, **project}


def append_run(project_id: str, scene: dict, result: dict) -> dict | None:
    with _lock:
        data = _load()
        project = data["projects"].get(project_id)
        if project is None:
            return None
        run_record = {"id": str(uuid.uuid4()), "scene": scene, "result": result}
        project["runs"].append(run_record)
        _save(data)
        return run_record
