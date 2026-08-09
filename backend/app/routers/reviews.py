from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models.review import Review
from ..models.task import Task, TaskStatus
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
    task = db.query(Task).filter(Task.id == review.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el cliente de esta tarea")
    if task.estado != TaskStatus.COMPLETADA:
        raise HTTPException(status_code=400, detail="La tarea aún no ha sido completada")
    existing = db.query(Review).filter(Review.task_id == review.task_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya calificaste esta tarea")
    db_review = Review(
        task_id=review.task_id,
        cliente_id=current_user.id,
        trabajador_id=review.trabajador_id,
        rating=review.rating,
        comentario=review.comentario
    )
    db.add(db_review)
    db.commit()
    db.refresh(db_review)
    worker = db.query(User).filter(User.id == review.trabajador_id).first()
    if worker:
        avg_rating = db.query(Review).filter(Review.trabajador_id == worker.id).with_entities(func.avg(Review.rating)).scalar()
        worker.rating = avg_rating or 0.0
        db.commit()
    return db_review
