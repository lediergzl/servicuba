from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models.task import Task, TaskStatus
from ..models.application import Application, AppStatus
from ..models.message import Message
from ..models.user import User
from ..schemas.message import MessageCreate, MessageResponse
from ..services.auth import get_current_user
from ..services.ws_manager import manager
from ..services.push_service import send_push_to_user
from ..utils.security import decode_token

router = APIRouter()


def _task_participant_ids(db: Session, task: Task) -> set:
    """cliente + trabajador(es) con postulación aceptada para esa tarea."""
    worker_ids = {
        row.worker_id
        for row in db.query(Application.worker_id)
        .filter(Application.task_id == task.id, Application.estado == AppStatus.ACEPTADA)
        .all()
    }
    return {task.cliente_id, *worker_ids}


def _ensure_participant(db: Session, task_id: UUID, user: User) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if user.id not in _task_participant_ids(db, task):
        raise HTTPException(status_code=403, detail="No participas en el chat de esta tarea")
    return task


@router.get("/conversations")
def get_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista las tareas donde el usuario tiene un chat activo (cliente con
    trabajador asignado, o trabajador con postulación aceptada), con el
    último mensaje y el conteo de no leídos — para la pestaña 'Mensajes'."""
    as_client_ids = {
        row.id for row in db.query(Task.id).filter(
            Task.cliente_id == current_user.id,
            Task.estado.in_([TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO, TaskStatus.COMPLETADA]),
        ).all()
    }
    as_worker_ids = {
        row.task_id for row in db.query(Application.task_id).filter(
            Application.worker_id == current_user.id,
            Application.estado == AppStatus.ACEPTADA,
        ).all()
    }
    task_ids = as_client_ids | as_worker_ids
    if not task_ids:
        return []

    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all()
    result = []
    for task in tasks:
        other_id = None
        if task.cliente_id == current_user.id:
            worker_app = db.query(Application).filter(
                Application.task_id == task.id, Application.estado == AppStatus.ACEPTADA
            ).first()
            other_id = worker_app.worker_id if worker_app else None
        else:
            other_id = task.cliente_id
        other_user = db.query(User).filter(User.id == other_id).first() if other_id else None

        last_msg = (
            db.query(Message)
            .filter(Message.task_id == task.id)
            .order_by(Message.created_at.desc())
            .first()
        )
        unread = (
            db.query(Message)
            .filter(Message.task_id == task.id, Message.sender_id != current_user.id, Message.leido == False)  # noqa: E712
            .count()
        )
        result.append({
            "task_id": str(task.id),
            "titulo": task.titulo,
            "estado": task.estado.value,
            "otro_participante": other_user.nombre if other_user else "—",
            "ultimo_mensaje": last_msg.contenido if last_msg else None,
            "ultimo_mensaje_fecha": last_msg.created_at.isoformat() if last_msg else None,
            "no_leidos": unread,
        })
    result.sort(key=lambda c: c["ultimo_mensaje_fecha"] or "", reverse=True)
    return result


@router.get("/{task_id}/messages", response_model=list[MessageResponse])
def get_messages(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_participant(db, task_id, current_user)
    messages = (
        db.query(Message)
        .filter(Message.task_id == task_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    # Marcar como leídos los mensajes que no envió el usuario actual
    changed = False
    for m in messages:
        if m.sender_id != current_user.id and not m.leido:
            m.leido = True
            changed = True
    if changed:
        db.commit()
    return messages


@router.websocket("/ws/{task_id}")
async def chat_websocket(websocket: WebSocket, task_id: UUID):
    token = websocket.query_params.get("token")
    payload = decode_token(token) if token else None
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == payload.get("sub")).first()
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task or user.id not in _task_participant_ids(db, task):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await manager.connect(task_id, user.id, websocket)
        try:
            while True:
                data = await websocket.receive_json()
                contenido = (data.get("contenido") or "").strip()
                if not contenido:
                    continue
                msg = Message(task_id=task_id, sender_id=user.id, contenido=contenido[:2000])
                db.add(msg)
                db.commit()
                db.refresh(msg)

                payload_out = {
                    "id": str(msg.id),
                    "task_id": str(msg.task_id),
                    "sender_id": str(msg.sender_id),
                    "contenido": msg.contenido,
                    "leido": msg.leido,
                    "created_at": msg.created_at.isoformat(),
                }
                await manager.broadcast(task_id, payload_out)

                # Avisar por push a los participantes que no están conectados
                # al chat de esta tarea en este momento.
                for participant_id in _task_participant_ids(db, task):
                    if participant_id == user.id:
                        continue
                    if not manager.is_user_connected(task_id, participant_id):
                        send_push_to_user(
                            db,
                            participant_id,
                            title=f"Nuevo mensaje de {user.nombre}",
                            body=contenido[:120],
                            url=f"/?task={task_id}&view=chat",
                        )
        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(task_id, websocket)
    finally:
        db.close()
