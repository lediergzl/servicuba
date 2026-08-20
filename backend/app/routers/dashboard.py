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
from ..services.plans import effective_plan, services_daily_limit, coverage_radius_km

router = APIRouter()


@router.get("/state")
def get_dashboard_state(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Single source of truth for dashboard KPIs and commercial entitlements."""
    user_id = current_user.id
    own_tasks = db.query(Task).filter(Task.cliente_id == user_id)
    own_task_rows = own_tasks.order_by(Task.created_at.desc()).limit(8).all()
    pending_received = db.query(Application).join(Task, Task.id == Application.task_id).filter(Task.cliente_id == user_id, Application.estado == AppStatus.PENDIENTE).count()
    my_applications = db.query(Application).filter(Application.worker_id == user_id)
    pending_sent = my_applications.filter(Application.estado == AppStatus.PENDIENTE).count(); accepted = my_applications.filter(Application.estado == AppStatus.ACEPTADA).count()
    active_own = own_tasks.filter(Task.estado.in_([TaskStatus.ACTIVA, TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO])).count(); completed_own = own_tasks.filter(Task.estado == TaskStatus.COMPLETADA).count()
    own_offers = db.query(Task).filter(Task.cliente_id == user_id, Task.tipo == "oferta"); active_offers = own_offers.filter(Task.estado == TaskStatus.ACTIVA).count()
    unread_messages = db.query(Message).filter(Message.sender_id != user_id, Message.leido == False, Message.task_id.in_(db.query(Task.id).filter(Task.cliente_id == user_id))).count()  # noqa: E712
    received_rows = db.query(Application, Task, User).join(Task, Task.id == Application.task_id).join(User, User.id == Application.worker_id).filter(Task.cliente_id == user_id).order_by(Application.created_at.desc()).limit(5).all()
    sent_rows = db.query(Application, Task).join(Task, Task.id == Application.task_id).filter(Application.worker_id == user_id).order_by(Application.created_at.desc()).limit(5).all()
    activity = [{"type":"application_received","status":a.estado.value,"title":t.titulo,"actor":w.nombre,"created_at":a.created_at.isoformat()} for a,t,w in received_rows] + [{"type":"application_sent","status":a.estado.value,"title":t.titulo,"actor":None,"created_at":a.created_at.isoformat()} for a,t in sent_rows]
    activity.sort(key=lambda x:x["created_at"], reverse=True)
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    plan = effective_plan(current_user); limit = services_daily_limit(current_user)
    used = db.query(func.count(Task.id)).filter(Task.cliente_id == user_id, Task.tipo.in_(["necesidad", "oferta"]), Task.created_at >= today).scalar() or 0
    return {"server_time":datetime.utcnow().isoformat(),"user":{"id":str(user_id),"nombre":current_user.nombre,"es_cliente":bool(current_user.es_cliente),"es_trabajador":bool(current_user.es_trabajador),"modo_activo":current_user.modo_activo,"verificado":bool(current_user.verificado),"plan":plan,"plan_expira":current_user.plan_expira.isoformat() if current_user.plan_expira else None},"plan":{"nombre":plan,"coverage_radius_km":coverage_radius_km(current_user),"publicaciones_hoy":used,"limite_diario":limit,"restantes_hoy":max(0,limit-used),"puede_anunciar":plan=="premium"},"cliente":{"tareas_activas":active_own,"tareas_completadas":completed_own,"solicitudes_recibidas":pending_received},"trabajador":{"postulaciones_pendientes":pending_sent,"trabajos_aceptados":accepted,"servicios_activos":active_offers},"global":{"mensajes_no_leidos":unread_messages},"activity":activity[:8],"recent_tasks":[{"id":str(t.id),"titulo":t.titulo,"estado":t.estado.value,"precio":t.precio,"created_at":t.created_at.isoformat() if t.created_at else None,"tipo":t.tipo} for t in own_task_rows]}
