"""Broadcaster en memoria para notificaciones en vivo (SSE).

Un solo proceso de Uvicorn/Render mantiene un dict {user_id: [asyncio.Queue]}.
Cuando push_service.send_push_to_user() manda un push real (Web Push VAPID),
también empuja el mismo mensaje a cualquier cola conectada de ese usuario —
así la APK (o cualquier pestaña con /push/stream abierto) lo recibe al
instante, sin tener que preguntar (polling).

Nota: al vivir en memoria, si Render reinicia el proceso las conexiones SSE
se cortan y el cliente debe reconectar (EventSource lo hace solo, automático,
con reintento). No se pierden notificaciones "de verdad": las que sí importan
siguen yendo también por Web Push / quedan en la app al hacer login de nuevo
a través de /dashboard/state, que ya consultas por separado.
"""
import asyncio
from collections import defaultdict
from uuid import UUID

_listeners: dict[str, list[asyncio.Queue]] = defaultdict(list)


def suscribir(user_id: UUID) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    _listeners[str(user_id)].append(q)
    return q


def desuscribir(user_id: UUID, q: asyncio.Queue):
    listeners = _listeners.get(str(user_id))
    if not listeners:
        return
    try:
        listeners.remove(q)
    except ValueError:
        pass
    if not listeners:
        _listeners.pop(str(user_id), None)


def emitir(user_id: UUID, payload: dict):
    """No bloqueante: si una cola está llena (cliente lento/colgado) se
    descarta ese evento para ese cliente en particular, nunca se espera."""
    for q in list(_listeners.get(str(user_id), [])):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass
