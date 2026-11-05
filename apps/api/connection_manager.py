"""Minimal real-time collaboration layer: broadcasts scene/run changes to
every client connected to the same project, and a connected-client count
("registro de participantes", docs/00-discovery.md §7.7).

Deliberately small: no auth/roles on the WS channel yet (the núcleo's
auth model doesn't exist in the MVP either, see docs/01-architecture.md),
no operational-transform/conflict resolution — last write wins, same as
the HTTP API. That is a real, named limitation, not a silent gap.
"""
from __future__ import annotations

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, set[WebSocket]] = {}

    async def connect(self, project_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.active.setdefault(project_id, set()).add(ws)
        await self.broadcast(project_id, {"type": "presence", "count": len(self.active[project_id])})

    async def disconnect(self, project_id: str, ws: WebSocket) -> None:
        conns = self.active.get(project_id)
        if not conns:
            return
        conns.discard(ws)
        if not conns:
            del self.active[project_id]
            return
        await self.broadcast(project_id, {"type": "presence", "count": len(conns)})

    async def broadcast(self, project_id: str, message: dict) -> None:
        for ws in list(self.active.get(project_id, ())):
            try:
                await ws.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()
