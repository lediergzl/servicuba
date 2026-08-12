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
    # A review belongs to a closed, confirmed contract. Lock the task so two
    # concurrent review requests cannot both pass the uniqueness check.
    task = (
        db.query(Task)
        .filter(Task.id == review.task_id)
        .with_for_update()
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id and task.tipo != "oferta":
        raise HTTPException(status_code=403, detail="No eres el cliente de esta tarea")
    if task.estado != TaskStatus.CONFIRMADA:
        raise HTTPException(status_code=400, detail="El servicio debe estar confirmado antes de calificarlo")

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

    # For a normal need, the accepted applicant is the worker. For an offer,
    # the publisher is the worker and the accepted applicant is the client.
    expected_worker_id = accepted.worker_id if task.tipo != "oferta" else task.cliente_id
    expected_client_id = task.cliente_id if task.tipo != "oferta" else accepted.worker_id

    if expected_client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sólo el cliente puede calificar al trabajador")
    if review.trabajador_id != expected_worker_id:
        raise HTTPException(status_code=400, detail="El trabajador indicado no corresponde a esta tarea")

    existing = db.query(Review).filter(Review.task_id == review.task_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya calificaste esta tarea")

    db_review = Review(
        task_id=review.task_id,
        cliente_id=expected_client_id,
        trabajador_id=expected_worker_id,
        rating=review.rating,
        comentario=review.comentario
    )
    db.add(db_review)
    db.flush()

    worker = db.query(User).filter(User.id == expected_worker_id).first()
    if worker:
        avg_rating = (
            db.query(func.avg(Review.rating))
            .filter(Review.trabajador_id == worker.id)
            .scalar()
        )
        worker.rating = float(avg_rating or 0.0)

    db.commit()
    db.refresh(db_review)
    return db_review
