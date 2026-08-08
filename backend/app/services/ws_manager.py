from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket


class ChatConnectionManager:
    """Mantiene las conexiones WebSocket activas agrupadas por tarea, para
    poder retransmitir un mensaje nuevo a los participantes conectados de
    esa tarea (cliente + trabajador aceptado)."""

    def __init__(self):
        # task_id -> lista de (websocket, user_id)
        self._connections: dict[UUID, list[tuple[WebSocket, UUID]]] = defaultdict(list)

    async def connect(self, task_id: UUID, user_id: UUID, websocket: WebSocket):
        await websocket.accept()
        self._connections[task_id].append((websocket, user_id))

    def disconnect(self, task_id: UUID, websocket: WebSocket):
        conns = self._connections.get(task_id)
        if not conns:
            return
        self._connections[task_id] = [c for c in conns if c[0] is not websocket]
        if not self._connections[task_id]:
            self._connections.pop(task_id, None)

    def is_user_connected(self, task_id: UUID, user_id: UUID) -> bool:
        return any(uid == user_id for _, uid in self._connections.get(task_id, []))

    async def broadcast(self, task_id: UUID, message: dict, exclude: WebSocket | None = None):
        for ws, _ in list(self._connections.get(task_id, [])):
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(task_id, ws)


manager = ChatConnectionManager()
