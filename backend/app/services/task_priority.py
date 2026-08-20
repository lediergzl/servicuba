"""Reglas de acceso prioritario a nuevas oportunidades.

La prioridad se aplica en backend y se reutiliza desde descubrimiento,
detalle, postulación y notificaciones para evitar que el frontend pueda
saltarse la ventana exclusiva.
"""
from datetime import datetime, timedelta

from fastapi import HTTPException

from ..models.task import Task
from ..models.user import User
from .plans import is_premium_active

NORMAL_PRIORITY_MINUTES = 10
BEST_OPPORTUNITY_PRIORITY_MINUTES = 30
BEST_OPPORTUNITY_MIN_PRICE = 2000.0


def is_best_opportunity(task: Task, now: datetime | None = None) -> bool:
    """Determina si una oportunidad merece la ventana PREMIUM larga.

    Por ahora se consideran mejores oportunidades las tareas destacadas o
    con presupuesto alto. La regla queda centralizada para poder sustituirla
    después por un score comercial sin tocar los endpoints.
    """
    now = now or datetime.utcnow()
    is_featured = bool(task.destacada and task.destacada_hasta and task.destacada_hasta > now)
    high_budget = task.precio is not None and float(task.precio) >= BEST_OPPORTUNITY_MIN_PRICE
    return is_featured or high_budget


def priority_window_minutes(task: Task, now: datetime | None = None) -> int:
    return BEST_OPPORTUNITY_PRIORITY_MINUTES if is_best_opportunity(task, now) else NORMAL_PRIORITY_MINUTES


def priority_release_at(task: Task, now: datetime | None = None) -> datetime:
    created = task.created_at or now or datetime.utcnow()
    return created + timedelta(minutes=priority_window_minutes(task, now))


def has_priority_access(user: User | None, task: Task, now: datetime | None = None) -> bool:
    if not task.created_at:
        return True
    if user is not None and is_premium_active(user):
        return True
    return (now or datetime.utcnow()) >= priority_release_at(task, now)


def ensure_priority_access(user: User, task: Task, now: datetime | None = None) -> None:
    if has_priority_access(user, task, now):
        return
    release_at = priority_release_at(task, now)
    minutes = priority_window_minutes(task, now)
    raise HTTPException(
        status_code=403,
        detail={
            "code": "PREMIUM_EARLY_ACCESS",
            "message": "Esta oportunidad está disponible inicialmente para profesionales PREMIUM.",
            "available_at": release_at.isoformat(),
            "priority_window_minutes": minutes,
        },
    )
