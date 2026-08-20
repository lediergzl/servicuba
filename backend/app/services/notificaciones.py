"""Avisos de nuevas tareas cercanas con prioridad real por plan."""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..models.pending_notification import PendingNotification
from .geo import haversine_distance
from .plans import is_premium_active, PLAN_GRATIS_RADIO_MAX_KM, PLAN_PREMIUM_RADIO_MAX_KM
from .task_priority import priority_window_minutes, is_best_opportunity
from .push_service import send_push_to_user


def notificar_nuevos_trabajadores_cercanos(db: Session, task: Task, lat: float, lng: float):
    candidatos = db.query(User).filter(User.es_trabajador == True, User.categoria_id == task.categoria_id, User.lat.isnot(None), User.lng.isnot(None)).all()  # noqa: E712
    if not candidatos: return
    minutos = priority_window_minutes(task)
    enviar_en_retraso = datetime.utcnow() + timedelta(minutes=minutos)
    mejor = is_best_opportunity(task)
    hubo_retrasados = False
    for worker in candidatos:
        premium = is_premium_active(worker)
        radio_km = PLAN_PREMIUM_RADIO_MAX_KM if premium else PLAN_GRATIS_RADIO_MAX_KM
        if haversine_distance(lat, lng, worker.lat, worker.lng) > radio_km: continue
        if premium:
            etiqueta = "🔥 Mejor oportunidad" if mejor else "⭐ Nueva oportunidad"
            send_push_to_user(db, worker.id, title=f"{etiqueta} cerca de ti", body=f"\"{task.titulo}\" — acceso prioritario para PREMIUM", url=f"/?task={task.id}")
        else:
            db.add(PendingNotification(worker_id=worker.id, task_id=task.id, titulo="Nueva tarea cerca de ti", cuerpo=f"\"{task.titulo}\"", url=f"/?task={task.id}", enviar_en=enviar_en_retraso)); hubo_retrasados=True
    if hubo_retrasados: db.commit()


def procesar_notificaciones_pendientes(db: Session):
    ahora=datetime.utcnow()
    pendientes=db.query(PendingNotification).filter(PendingNotification.enviado == False, PendingNotification.enviar_en <= ahora).limit(200).all()  # noqa: E712
    if not pendientes: return
    task_ids={p.task_id for p in pendientes}
    tareas_activas={row.id for row in db.query(Task.id).filter(Task.id.in_(task_ids),Task.estado==TaskStatus.ACTIVA).all()}
    for aviso in pendientes:
        if aviso.task_id in tareas_activas: send_push_to_user(db,aviso.worker_id,title=aviso.titulo,body=aviso.cuerpo,url=aviso.url)
        aviso.enviado=True
    db.commit()
