"""Notificaciones en vivo por Server-Sent Events (SSE)."""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..database import SessionLocal
from ..models.user import User
from ..utils.security import decode_token
from ..services import live_events

router = APIRouter()
_KEEPALIVE_SEGUNDOS = 25


def _usuario_desde_token(token: str) -> User:
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or getattr(user, "suspendido", False):
            raise HTTPException(status_code=401, detail="Usuario no válido")
        return user
    finally:
        db.close()


def _formatear_evento(evento: str, data: dict) -> str:
    return f"event: {evento}\ndata: {json.dumps(data)}\n\n"


@router.get("/stream")
async def stream_notificaciones(request: Request, token: str | None = None):
    # EventSource same-origin envía cookies automáticamente. Esto permite
    # autenticación HttpOnly sin exponer el JWT en URL, historial o logs.
    effective_token = request.cookies.get("servicuba_access") or token
    if not effective_token:
        raise HTTPException(status_code=401, detail="No autenticado")
    user = _usuario_desde_token(effective_token)
    queue = live_events.suscribir(user.id)

    async def eventos():
        try:
            yield _formatear_evento("ready", {"ok": True})
            while True:
                if await request.is_disconnected(): break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=_KEEPALIVE_SEGUNDOS)
                    yield _formatear_evento("notificacion", payload)
                except asyncio.TimeoutError:
                    yield _formatear_evento("ping", {})
        finally:
            live_events.desuscribir(user.id, queue)

    return StreamingResponse(eventos(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
