"""Notificaciones en vivo por Server-Sent Events (SSE) — reemplaza al push
nativo (Capacitor PushNotifications) para la APK, que requeriría Firebase
Cloud Messaging. Firebase está bloqueado/no es confiable en Cuba (embargo de
EE.UU.), así que en vez de "push real" con la app cerrada, mantenemos una
conexión HTTP abierta mientras la app está en uso: el servidor empuja el
evento apenas ocurre (ver services/push_service.send_push_to_user), sin que
el cliente tenga que preguntar por polling.

EventSource (la API del navegador/WebView para consumir SSE) no permite
mandar headers personalizados, así que aquí el token va como query param en
vez de vía el Authorization header que usa el resto de la API.

No usa sse-starlette a propósito: StreamingResponse ya viene con FastAPI,
así no hace falta tocar requirements.txt."""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..database import SessionLocal
from ..models.user import User
from ..utils.security import decode_token
from ..services import live_events

router = APIRouter()

_KEEPALIVE_SEGUNDOS = 25  # menor que timeouts típicos de proxy (Render/Cloudflare)


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
async def stream_notificaciones(request: Request, token: str):
    user = _usuario_desde_token(token)
    queue = live_events.suscribir(user.id)

    async def eventos():
        try:
            yield _formatear_evento("ready", {"ok": True})
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=_KEEPALIVE_SEGUNDOS)
                    yield _formatear_evento("notificacion", payload)
                except asyncio.TimeoutError:
                    yield _formatear_evento("ping", {})
        finally:
            live_events.desuscribir(user.id, queue)

    return StreamingResponse(
        eventos(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
