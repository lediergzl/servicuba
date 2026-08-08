from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from ..database import get_db
from ..models.application import Application, AppStatus
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..schemas.application import ApplicationCreate, ApplicationResponse
from ..services.auth import get_current_user
from ..services.push_service import send_push_to_user
from ..services.plans import is_premium_active, PLAN_GRATIS_POSTULACIONES_SEMANA
from uuid import UUID

router = APIRouter()

@router.post("/{task_id}/apply", response_model=ApplicationResponse)
def apply_to_task(
    task_id: UUID,
    application: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.rol.value != "trabajador":
        raise HTTPException(status_code=403, detail="Solo trabajadores pueden postularse")

    if PLAN_GRATIS_POSTULACIONES_SEMANA is not None and not is_premium_active(current_user):
        hace_7_dias = datetime.utcnow() - timedelta(days=7)
        postulaciones_semana = db.query(Application).filter(
            Application.worker_id == current_user.id,
            Application.created_at >= hace_7_dias,
        ).count()
        if postulaciones_semana >= PLAN_GRATIS_POSTULACIONES_SEMANA:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Alcanzaste el límite de {PLAN_GRATIS_POSTULACIONES_SEMANA} "
                    "postulaciones semanales del plan gratis. Hazte premium para "
                    "postularte sin límite."
                ),
            )

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or task.estado != TaskStatus.ACTIVA:
        raise HTTPException(status_code=404, detail="Tarea no disponible")
    existing = db.query(Application).filter(
        Application.task_id == task_id,
        Application.worker_id == current_user.id,
        Application.estado == AppStatus.PENDIENTE
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya te has postulado a esta tarea")
    db_app = Application(
        task_id=task_id,
        worker_id=current_user.id,
        mensaje=application.mensaje,
        estado=AppStatus.PENDIENTE
    )
    db.add(db_app)
    db.commit()
    db.refresh(db_app)
    send_push_to_user(
        db, task.cliente_id,
        title="Nueva postulación",
        body=f"{current_user.nombre} se postuló a \"{task.titulo}\"",
        url=f"/?task={task_id}",
    )
    return db_app

@router.post("/{application_id}/accept")
def accept_application(
    application_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    task = db.query(Task).filter(Task.id == app.task_id).first()
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el cliente de esta tarea")
    if task.estado != TaskStatus.ACTIVA:
        raise HTTPException(status_code=400, detail="La tarea ya no está activa")
    app.estado = AppStatus.ACEPTADA
    task.estado = TaskStatus.ASIGNADA
    db.commit()
    send_push_to_user(
        db, app.worker_id,
        title="¡Postulación aceptada!",
        body=f"Te asignaron \"{task.titulo}\"",
        url=f"/?task={task.id}&view=chat",
    )
    return {"message": "Trabajador aceptado correctamente"}
