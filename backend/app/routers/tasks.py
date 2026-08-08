from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from geoalchemy2.functions import ST_DWithin, ST_Distance, ST_SetSRID, ST_MakePoint, ST_X, ST_Y
from ..database import get_db
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..schemas.task import TaskCreate, TaskResponse
from ..services.auth import get_current_user
from ..services.plans import is_premium_active, PLAN_GRATIS_RADIO_MAX_KM, PLAN_PREMIUM_RADIO_MAX_KM
from uuid import UUID
from typing import Optional

router = APIRouter()

@router.post("", response_model=TaskResponse)
def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.rol.value != "cliente":
        raise HTTPException(status_code=403, detail="Solo clientes pueden crear tareas")
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
        estado=TaskStatus.ACTIVA
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
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
    # El radio de búsqueda es un beneficio del plan: gratis ve cerca,
    # premium ve más lejos. Se limita silenciosamente en vez de rechazar
    # la petición, para no romper al frontend si pide de más.
    radio_max = PLAN_PREMIUM_RADIO_MAX_KM if is_premium_active(current_user) else PLAN_GRATIS_RADIO_MAX_KM
    radius_km = min(radius_km, radio_max)

    radius_m = radius_km * 1000
    point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    now = datetime.utcnow()
    query = db.query(
        Task,
        ST_Distance(Task.ubicacion, point).label("distance"),
        ST_Y(Task.ubicacion).label("task_lat"),
        ST_X(Task.ubicacion).label("task_lng"),
    ).filter(
        Task.estado == TaskStatus.ACTIVA,
        ST_DWithin(Task.ubicacion, point, radius_m)
    )
    if category_id:
        query = query.filter(Task.categoria_id == category_id)
    # Las tareas destacadas (pagas) aparecen primero; dentro de cada grupo,
    # ordena por cercanía.
    destacada_activa = (Task.destacada == True) & (Task.destacada_hasta > now)  # noqa: E712
    results = query.order_by(destacada_activa.desc(), "distance").limit(50).all()
    tasks = []
    for task, dist, task_lat, task_lng in results:
        tasks.append({
            "id": task.id,
            "titulo": task.titulo,
            "precio": task.precio,
            "distancia_km": round(dist / 1000, 2),
            "categoria_id": task.categoria_id,
            "estado": task.estado.value,
            "destacada": bool(task.destacada and task.destacada_hasta and task.destacada_hasta > now),
            "created_at": task.created_at,
            "lat": task_lat,
            "lng": task_lng,
        })
    return tasks

@router.get("/my", response_model=list[TaskResponse])
def get_my_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # NOTA: agregado porque frontend/js/tasks.js llama a GET /api/tasks/my
    # y el router original no lo definía (era una llamada rota).
    # Debe declararse ANTES de /{task_id} para que "my" no se intente
    # interpretar como un UUID.
    return (
        db.query(Task)
        .filter(Task.cliente_id == current_user.id)
        .order_by(Task.created_at.desc())
        .all()
    )

@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: UUID, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return task

@router.post("/{task_id}/complete", response_model=TaskResponse)
def complete_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # NOTA: agregado porque el router de reviews exige que la tarea esté
    # en estado COMPLETADA, pero no existía ninguna ruta que hiciera esa
    # transición: la reseña era inalcanzable en el flujo original.
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el cliente de esta tarea")
    if task.estado not in (TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO):
        raise HTTPException(status_code=400, detail="La tarea debe estar asignada para marcarla como completada")
    task.estado = TaskStatus.COMPLETADA
    db.commit()
    db.refresh(task)
    return task
