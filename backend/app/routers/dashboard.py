from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.task import Task, TaskStatus
from ..models.application import Application, AppStatus
from ..models.message import Message
from ..models.user import User
from ..services.auth import get_current_user

router = APIRouter()


@router.get("/state")
def get_dashboard_state(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Single source of truth for the authenticated dashboard KPIs/activity."""
    user_id = current_user.id

    own_tasks = db.query(Task).filter(Task.cliente_id == user_id)
    own_task_rows = own_tasks.order_by(Task.created_at.desc()).limit(8).all()

    pending_received = db.query(Application).join(Task, Task.id == Application.task_id).filter(
        Task.cliente_id == user_id,
        Application.estado == AppStatus.PENDIENTE,
    ).count()

    my_applications = db.query(Application).filter(Application.worker_id == user_id)
    pending_sent = my_applications.filter(Application.estado == AppStatus.PENDIENTE).count()
    accepted = my_applications.filter(Application.estado == AppStatus.ACEPTADA).count()

    active_own = own_tasks.filter(Task.estado.in_([
        TaskStatus.ACTIVA, TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO,
    ])).count()
    completed_own = own_tasks.filter(Task.estado == TaskStatus.COMPLETADA).count()

    # Publications of the current worker are represented by tasks of tipo oferta.
    own_offers = db.query(Task).filter(Task.cliente_id == user_id, Task.tipo == "oferta")
    active_offers = own_offers.filter(Task.estado == TaskStatus.ACTIVA).count()

    unread_messages = db.query(Message).filter(
        Message.sender_id != user_id,
        Message.leido == False,  # noqa: E712
        Message.task_id.in_(
            db.query(Task.id).filter(Task.cliente_id == user_id)
        ),
    ).count()

    # Applications received on own publications are the most useful recent activity
    # signal for clients. For workers, sent applications provide the equivalent signal.
    received_rows = (
        db.query(Application, Task, User)
        .join(Task, Task.id == Application.task_id)
        .join(User, User.id == Application.worker_id)
        .filter(Task.cliente_id == user_id)
        .order_by(Application.created_at.desc())
        .limit(5).all()
    )
    sent_rows = (
        db.query(Application, Task)
        .join(Task, Task.id == Application.task_id)
        .filter(Application.worker_id == user_id)
        .order_by(Application.created_at.desc())
        .limit(5).all()
    )

    activity = []
    for app, task, worker in received_rows:
        activity.append({
            "type": "application_received",
            "status": app.estado.value,
            "title": task.titulo,
            "actor": worker.nombre,
            "created_at": app.created_at.isoformat(),
        })
    for app, task in sent_rows:
        activity.append({
            "type": "application_sent",
            "status": app.estado.value,
            "title": task.titulo,
            "actor": None,
            "created_at": app.created_at.isoformat(),
        })
    activity.sort(key=lambda x: x["created_at"], reverse=True)

    return {
        "server_time": datetime.utcnow().isoformat(),
        "user": {
            "id": str(user_id),
            "nombre": current_user.nombre,
            "es_cliente": bool(current_user.es_cliente),
            "es_trabajador": bool(current_user.es_trabajador),
            "modo_activo": current_user.modo_activo,
            "verificado": bool(current_user.verificado),
        },
        "cliente": {
            "tareas_activas": active_own,
            "tareas_completadas": completed_own,
            "solicitudes_recibidas": pending_received,
        },
        "trabajador": {
            "postulaciones_pendientes": pending_sent,
            "trabajos_aceptados": accepted,
            "servicios_activos": active_offers,
        },
        "global": {
            "mensajes_no_leidos": unread_messages,
        },
        "activity": activity[:8],
        "recent_tasks": [
            {
                "id": str(t.id),
                "titulo": t.titulo,
                "estado": t.estado.value,
                "precio": t.precio,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "tipo": t.tipo,
            }
            for t in own_task_rows
        ],
    }
