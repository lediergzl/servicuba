from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models.review import Review
from ..models.task import Task, TaskStatus
from ..models.application import Application, AppStatus
from ..models.user import User
from ..schemas.review import ReviewCreate, ReviewResponse
from ..services.auth import get_current_user

router = APIRouter()

@router.post("", response_model=ReviewResponse)
def create_review(
    review: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Lock the task so two concurrent review requests cannot both pass the
    # existence check before either inserts the review.
    task = (
        db.query(Task)
        .filter(Task.id == review.task_id)
        .with_for_update()
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el cliente de esta tarea")
    if task.estado != TaskStatus.COMPLETADA:
        raise HTTPException(status_code=400, detail="La tarea aún no ha sido completada")

    # Never trust trabajador_id supplied by the client. It must be the
    # worker whose application was actually accepted for this task.
    accepted = (
        db.query(Application)
        .filter(
            Application.task_id == task.id,
            Application.estado == AppStatus.ACEPTADA,
        )
        .first()
    )
    if not accepted:
        raise HTTPException(status_code=400, detail="La tarea no tiene un trabajador asignado")
    if accepted.worker_id != review.trabajador_id:
        raise HTTPException(status_code=400, detail="El trabajador indicado no corresponde a esta tarea")

    existing = db.query(Review).filter(Review.task_id == review.task_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya calificaste esta tarea")

    db_review = Review(
        task_id=review.task_id,
        cliente_id=current_user.id,
        trabajador_id=accepted.worker_id,
        rating=review.rating,
        comentario=review.comentario
    )
    db.add(db_review)
    db.flush()

    worker = db.query(User).filter(User.id == accepted.worker_id).first()
    if worker:
        avg_rating = (
            db.query(func.avg(Review.rating))
            .filter(Review.trabajador_id == worker.id)
            .scalar()
        )
        worker.rating = avg_rating or 0.0

    db.commit()
    db.refresh(db_review)
    return db_review
