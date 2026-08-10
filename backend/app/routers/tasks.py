from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast
from datetime import datetime
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_Distance, ST_SetSRID, ST_MakePoint, ST_X, ST_Y
from ..database import get_db
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..schemas.task import TaskCreate, TaskUpdate, TaskResponse
from ..services.auth import get_current_user
from ..services.plans import is_premium_active, PLAN_GRATIS_RADIO_MAX_KM, PLAN_PREMIUM_RADIO_MAX_KM
from ..services.nearby import find_nearby
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
    # ubicacion es Geometry(SRID 4326): sin castear a geography, PostGIS
    # calcula ST_Distance/ST_DWithin en GRADOS, no en metros. Eso hacía que
    # "distancia_km" saliera siempre ~0 (una fracción de grado dividida
    # entre 1000) y que ST_DWithin(..., radius_m) — comparando miles contra
    # fracciones de grado — fuera prácticamente siempre verdadero sin
    # importar el radio elegido, o sea el filtro de radio no filtraba nada.
    geo_task = cast(Task.ubicacion, Geography)
    geo_point = cast(point, Geography)
    now = datetime.utcnow()
    query = db.query(
        Task,
        ST_Distance(geo_task, geo_point).label("distance"),
        ST_Y(Task.ubicacion).label("task_lat"),
        ST_X(Task.ubicacion).label("task_lng"),
    ).filter(
        Task.estado == TaskStatus.ACTIVA,
        ST_DWithin(geo_task, geo_point, radius_m)
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

@router.get("/my")
def get_my_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # NOTA: agregado porque frontend/js/tasks.js llama a GET /api/tasks/my
    # y el router original no lo definía (era una llamada rota).
    # Debe declararse ANTES de /{task_id} para que "my" no se intente
    # interpretar como un UUID.
    from ..models.application import Application, AppStatus
    from ..models.user import User as UserModel
    from ..models.review import Review

    tasks = (
        db.query(Task)
        .filter(Task.cliente_id == current_user.id)
        .order_by(Task.created_at.desc())
        .all()
    )

    result = []
    for task in tasks:
        # Nombre del trabajador aceptado (si lo hay) — se usa para poner
        # un encabezado real en el chat en vez de dejarlo en blanco.
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
            "destacada": task.destacada,
            "destacada_hasta": task.destacada_hasta,
            "created_at": task.created_at,
            "trabajador_id": worker_id,
            "trabajador_nombre": worker_nombre,
            "ya_reseniada": ya_reseniada,
        })
    return result


# ---------- Ofertas (trabajador publica un servicio, cliente lo solicita) ----------
# Mismo mecanismo que las "necesidades" de arriba, en la dirección
# contraria — ver la nota grande en frontend/js/tasks.js y en
# services/nearby.py sobre por qué casi todo el resto (postularse/
# solicitar, aceptar, chat, destacar) ya es genérico y no necesita rutas
# propias. Sólo faltaban estas tres: crear, buscar cercanas y listar
# las propias. Deben declararse ANTES de GET /{task_id} para que
# "ofertas" no se intente interpretar como un UUID.

@router.post("/ofertas", response_model=TaskResponse)
def create_oferta(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.es_trabajador:
        raise HTTPException(status_code=403, detail="Activa tu perfil de trabajador para publicar un servicio")
    point = ST_SetSRID(ST_MakePoint(task.lng, task.lat), 4326)
    db_task = Task(
        cliente_id=current_user.id,  # quien PUBLICÓ (el trabajador) — ver nota en models/task.py
        categoria_id=task.categoria_id,
        titulo=task.titulo,
        descripcion=task.descripcion,
        precio=task.precio,
        ubicacion=point,
        municipio=task.municipio,
        zona=task.zona,
        referencia=task.referencia,
        estado=TaskStatus.ACTIVA,
        tipo="oferta",
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.get("/ofertas/nearby")
def get_nearby_ofertas(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(3.0, ge=0.1, le=50),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Mismo beneficio de radio por plan que /tasks/nearby, aplicado acá
    # aunque quien busca sea un cliente (no sólo trabajadores premium).
    radio_max = PLAN_PREMIUM_RADIO_MAX_KM if is_premium_active(current_user) else PLAN_GRATIS_RADIO_MAX_KM
    radius_km = min(radius_km, radio_max)
    return find_nearby(db, lat, lng, radius_km, tipo="oferta", category_id=category_id)


@router.get("/ofertas/mine")
def get_my_ofertas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from ..models.application import Application, AppStatus
    from ..models.user import User as UserModel

    ofertas = (
        db.query(Task)
        .filter(Task.cliente_id == current_user.id, Task.tipo == "oferta")
        .order_by(Task.created_at.desc())
        .all()
    )

    result = []
    for oferta in ofertas:
        # Nombre del CLIENTE cuya solicitud fue aceptada (si lo hay) —
        # tasks.js usa esto para el encabezado del chat de una oferta
        # (openChatForTask lee o.cliente_nombre, no o.trabajador_nombre).
        cliente_solicitante_id = None
        cliente_nombre = None
        if oferta.estado.value in ("asignada", "en_proceso", "completada"):
            row = (
                db.query(UserModel.id, UserModel.nombre)
                .join(Application, Application.worker_id == UserModel.id)
                .filter(Application.task_id == oferta.id, Application.estado == AppStatus.ACEPTADA)
                .first()
            )
            if row:
                cliente_solicitante_id = str(row.id)
                cliente_nombre = row.nombre

        result.append({
            "id": str(oferta.id),
            "cliente_id": str(oferta.cliente_id),
            "categoria_id": oferta.categoria_id,
            "titulo": oferta.titulo,
            "descripcion": oferta.descripcion,
            "precio": oferta.precio,
            "municipio": oferta.municipio,
            "zona": oferta.zona,
            "referencia": oferta.referencia,
            "estado": oferta.estado.value,
            "destacada": oferta.destacada,
            "destacada_hasta": oferta.destacada_hasta,
            "created_at": oferta.created_at,
            "cliente_solicitante_id": cliente_solicitante_id,
            "cliente_nombre": cliente_nombre,
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
    # Antes no existía ninguna forma de editar una tarea ya creada —
    # cualquier error de tipeo (precio, descripción) quedaba fijo para
    # siempre. Sólo se permite mientras está "activa": una vez asignada,
    # el trabajador ya aceptó en base a esos datos.
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el cliente de esta tarea")
    if task.estado != TaskStatus.ACTIVA:
        raise HTTPException(status_code=400, detail="Sólo se puede editar una tarea mientras está activa (sin trabajador asignado)")

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
    # Antes no existía ninguna forma de eliminar/cancelar una tarea. Es un
    # borrado lógico (CANCELADA), no un DELETE real: applications y
    # messages tienen FK a tasks.id, así que borrarla de la tabla
    # rompería ese historial (o directamente fallaría por la FK).
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el cliente de esta tarea")
    if task.estado == TaskStatus.COMPLETADA:
        raise HTTPException(status_code=400, detail="No se puede cancelar una tarea ya completada")
    if task.estado == TaskStatus.CANCELADA:
        raise HTTPException(status_code=400, detail="Esta tarea ya está cancelada")

    task.estado = TaskStatus.CANCELADA
    db.commit()
    return {"message": "Tarea cancelada correctamente"}

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
