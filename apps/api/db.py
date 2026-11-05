"""Real persistence layer (PostgreSQL via asyncpg), replacing the
storage.py JSON-file placeholder per docs/01-architecture.md §4 and
docs/02-roadmap.md Fase 7.

Schema: one row per project (scene as JSONB, opaque to this module —
its shape is owned by the project's discipline adapter, same contract
as storage.py had), one row per run (append-only history). UUIDs are
generated in Python, not DB-side, to avoid depending on a Postgres
extension (pgcrypto/uuid-ossp) just for that.
"""
from __future__ import annotations

import json
import os
import uuid

import asyncpg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://usl:usl@localhost:5432/usl")

_pool: asyncpg.Pool | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    discipline TEXT NOT NULL,
    scene JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene JSONB NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runs_project_id_idx ON runs (project_id, created_at);
"""


async def connect() -> None:
    global _pool
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    async with _pool.acquire() as conn:
        await conn.execute(SCHEMA)


async def disconnect() -> None:
    if _pool is not None:
        await _pool.close()


def _pool_or_raise() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized — call connect() during app startup.")
    return _pool


async def list_projects(discipline: str | None = None) -> list[dict]:
    pool = _pool_or_raise()
    query = """
        SELECT p.id, p.name, p.discipline, COUNT(r.id) AS run_count
        FROM projects p LEFT JOIN runs r ON r.project_id = p.id
        WHERE ($1::text IS NULL OR p.discipline = $1)
        GROUP BY p.id ORDER BY p.created_at DESC
    """
    rows = await pool.fetch(query, discipline)
    return [
        {"id": str(r["id"]), "name": r["name"], "discipline": r["discipline"], "run_count": r["run_count"]}
        for r in rows
    ]


async def create_project(name: str, discipline: str) -> dict:
    pool = _pool_or_raise()
    pid = uuid.uuid4()
    await pool.execute(
        "INSERT INTO projects (id, name, discipline, scene) VALUES ($1, $2, $3, '{}'::jsonb)",
        pid, name, discipline,
    )
    return {"id": str(pid), "name": name, "discipline": discipline, "scene": {}, "runs": []}


async def get_project(project_id: str) -> dict | None:
    pool = _pool_or_raise()
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        return None
    project_row = await pool.fetchrow(
        "SELECT id, name, discipline, scene FROM projects WHERE id = $1", pid
    )
    if project_row is None:
        return None
    run_rows = await pool.fetch(
        "SELECT id, scene, result FROM runs WHERE project_id = $1 ORDER BY created_at ASC", pid
    )
    return {
        "id": str(project_row["id"]),
        "name": project_row["name"],
        "discipline": project_row["discipline"],
        "scene": json.loads(project_row["scene"]),
        "runs": [
            {"id": str(r["id"]), "scene": json.loads(r["scene"]), "result": json.loads(r["result"])}
            for r in run_rows
        ],
    }


async def save_scene(project_id: str, scene: dict) -> dict | None:
    pool = _pool_or_raise()
    pid = uuid.UUID(project_id)
    result = await pool.execute("UPDATE projects SET scene = $2 WHERE id = $1", pid, json.dumps(scene))
    if result == "UPDATE 0":
        return None
    return await get_project(project_id)


async def append_run(project_id: str, scene: dict, result: dict) -> dict | None:
    pool = _pool_or_raise()
    pid = uuid.UUID(project_id)
    exists = await pool.fetchval("SELECT 1 FROM projects WHERE id = $1", pid)
    if not exists:
        return None
    run_id = uuid.uuid4()
    await pool.execute(
        "INSERT INTO runs (id, project_id, scene, result) VALUES ($1, $2, $3, $4)",
        run_id, pid, json.dumps(scene), json.dumps(result),
    )
    return {"id": str(run_id), "scene": scene, "result": result}
