from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast
from datetime import datetime, timedelta
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_Distance, ST_SetSRID, ST_MakePoint, ST_X, ST_Y
from ..database import get_db
from ..models.task import Task, TaskStatus
from ..models.user import User, UserPlan
from ..schemas.task import TaskCreate, TaskUpdate, TaskResponse
from ..services.auth import get_current_user
from ..services.plans import (
    is_premium_active,
    services_daily_limit,
    effective_plan,
    PLAN_GRATIS_RADIO_MAX_KM,
    PLAN_PREMIUM_RADIO_MAX_KM,
)
from ..services.nearby import find_nearby
from ..services.notificaciones import notificar_nuevos_trabajadores_cercanos
from uuid import UUID
from typing import Optional
import logging

logger = logging.getLogger("tasks")
router = APIRouter()


def _publicaciones_hoy(db: Session, user_id: UUID, tipo: str) -> int:
    """Cuenta publicaciones del usuario desde medianoche UTC."""
    inicio = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(func.count(Task.id))
        .filter(
            Task.cliente_id == user_id,
            Task.tipo == tipo,
            Task.created_at >= inicio,
        )
        .scalar()
        or 0
    )


def _validar_permiso_publicacion(db: Session, user: User, tipo: str = "necesidad") -> str:
    """La UI nunca es la autoridad: el plan se valida aquí antes de escribir.

    FREE descubre, contacta y contrata, pero no publica. BASE y PREMIUM
    pueden publicar dentro de su cuota diaria.
    """
    plan = effective_plan(user)
    if plan == UserPlan.GRATIS.value:
        raise HTTPException(
            status_code=403,
            detail="Tu plan FREE permite buscar y contratar servicios. Actualiza a BASE para publicar.",
        )

    limite = services_daily_limit(user)
    usados = _publicaciones_hoy(db, user.id, tipo)
    if usados >= limite:
        nombre = "Premium" if plan == UserPlan.PREMIUM.value else "Base"
        raise HTTPException(
            status_code=429,
            detail=f"Alcanzaste el límite diario de {limite} publicación(es) de tu plan {nombre}.",
        )
    return plan


@router.post("", response_model=TaskResponse)
def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.es_cliente:
        raise HTTPException(status_code=403, detail="Activa tu perfil de cliente para crear tareas")

    _validar_permiso_publicacion(db, current_user, "necesidad")

    point = ST_SetSRID(ST_MakePoint(task.lng, task.lat), 4326)
    db_task = Task(
        cliente_id=current_user.id,
        categoria_id=task.categoria_id,
        titulo=task.titulo,
        descripcion=task.descripcion,
        precio=task.precio,
        ubicacion=point,
        municipio=task.municipio,
        zona=task.zona,
        referencia=task.referencia,
        estado=TaskStatus.ACTIVA,
        tipo="necesidad",
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    try:
        notificar_nuevos_trabajadores_cercanos(db, db_task, task.lat, task.lng)
    except Exception:
        logger.warning("No se pudo notificar a trabajadores cercanos de la tarea %s", db_task.id, exc_info=True)

    return db_task


@router.get("/nearby")
def get_nearby_tasks(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(3.0, ge=0.1, le=50),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    radio_max = PLAN_PREMIUM_RADIO_MAX_KM if is_premium_active(current_user) else PLAN_GRATIS_RADIO_MAX_KM
    radius_km = min(radius_km, radio_max)
    radius_m = radius_km * 1000
    point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    geo_task = cast(Task.ubicacion, Geography)
    geo_point = cast(point, Geography)
    now = datetime.utcnow()

    publicador_premium = (
        (User.plan == UserPlan.PREMIUM)
        & (User.plan_expira.isnot(None))
        & (User.plan_expira > now)
    )

    query = (
        db.query(
            Task,
            ST_Distance(geo_task, geo_point).label("distance"),
            ST_Y(Task.ubicacion).label("task_lat"),
            ST_X(Task.ubicacion).label("task_lng"),
            publicador_premium.label("publicador_premium"),
        )
        .join(User, User.id == Task.cliente_id)
        .filter(
            Task.estado == TaskStatus.ACTIVA,
            Task.tipo == "necesidad",
            ST_DWithin(geo_task, geo_point, radius_m),
        )
    )
    if category_id:
        query = query.filter(Task.categoria_id == category_id)
    destacada_pagada = (Task.destacada == True) & (Task.destacada_hasta > now)  # noqa: E712
    boost_activo = destacada_pagada | publicador_premium
    results = query.order_by(boost_activo.desc(), "distance").limit(50).all()

    return [
        {
            "id": task.id,
            "titulo": task.titulo,
            "precio": task.precio,
            "distancia_km": round(dist / 1000, 2),
            "categoria_id": task.categoria_id,
            "estado": task.estado.value,
            "destacada": bool(
                (task.destacada and task.destacada_hasta and task.destacada_hasta > now)
                or premium
            ),
            "created_at": task.created_at,
            "lat": task_lat,
            "lng": task_lng,
        }
        for task, dist, task_lat, task_lng, premium in results
    ]


@router.get("/my")
def get_my_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from ..models.application import Application, AppStatus
    from ..models.user import User as UserModel
    from ..models.review import Review

    tasks = (
        db.query(Task)
        .filter(Task.cliente_id == current_user.id, Task.tipo == "necesidad")
        .order_by(Task.created_at.desc())
        .all()
    )

    now = datetime.utcnow()
    publicador_premium = is_premium_active(current_user)
    result = []
    for task in tasks:
        worker_id = None
        worker_nombre = None
        if task.estado.value in ("asignada", "en_proceso", "completada"):
            row = (
                db.query(UserModel.id, UserModel.nombre)
                .join(Application, Application.worker_id == UserModel.id)
                .filter(Application.task_id == task.id, Application.estado == AppStatus.ACEPTADA)
                .first()
            )
            if row:
                worker_id = str(row.id)
                worker_nombre = row.nombre

        ya_reseniada = False
        if task.estado.value == "completada":
            ya_reseniada = db.query(Review).filter(Review.task_id == task.id).first() is not None

        result.append({
            "id": str(task.id),
            "cliente_id": str(task.cliente_id),
            "categoria_id": task.categoria_id,
            "titulo": task.titulo,
            "descripcion": task.descripcion,
            "precio": task.precio,
            "municipio": task.municipio,
            "zona": task.zona,
            "referencia": task.referencia,
            "estado": task.estado.value,
            "destacada": bool(
                (task.destacada and task.destacada_hasta and task.destacada_hasta > now)
                or publicador_premium
            ),
            "destacada_hasta": task.destacada_hasta,
            "created_at": task.created_at,
            "worker_id": worker_id,
            "worker_nombre": worker_nombre,
            "ya_reseniada": ya_reseniada,
        })
    return result


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: UUID, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el publicador de esta publicación")
    if task.estado != TaskStatus.ACTIVA:
        raise HTTPException(status_code=400, detail="Sólo se puede editar una publicación mientras está activa")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el publicador de esta publicación")
    if task.estado == TaskStatus.COMPLETADA:
        raise HTTPException(status_code=400, detail="No se puede cancelar una publicación ya completada")
    if task.estado == TaskStatus.CANCELADA:
        raise HTTPException(status_code=400, detail="Esta publicación ya está cancelada")

    task.estado = TaskStatus.CANCELADA
    db.commit()
    return {"message": "Publicación cancelada correctamente"}


@router.post("/{task_id}/complete", response_model=TaskResponse)
def complete_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el publicador de esta publicación")
    if task.estado not in (TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO):
        raise HTTPException(status_code=400, detail="La publicación debe estar asignada para marcarla como completada")
    task.estado = TaskStatus.COMPLETADA
    db.commit()
    db.refresh(task)
    return task