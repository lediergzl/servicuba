from fastapi import APIRouter, Depends, HTTPException, Query
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


def _avg(db: Session, worker_id, column):
    value = db.query(func.avg(column)).filter(Review.trabajador_id == worker_id).scalar()
    return round(float(value), 2) if value is not None else None


def _summary(db: Session, worker: User):
    total = db.query(func.count(Review.id)).filter(Review.trabajador_id == worker.id).scalar() or 0
    return {
        "worker_id": str(worker.id),
        "rating": round(float(worker.rating or 0), 2),
        "reviews": int(total),
        "verified": True,
        "dimensions": {
            "calidad_trabajo": _avg(db, worker.id, Review.calidad_trabajo),
            "trato": _avg(db, worker.id, Review.trato),
            "puntualidad": _avg(db, worker.id, Review.puntualidad),
            "precio_acordado": _avg(db, worker.id, Review.precio_acordado),
        },
    }


@router.post("", response_model=ReviewResponse)
def create_review(review: ReviewCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == review.task_id).with_for_update().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id and task.tipo != "oferta":
        raise HTTPException(status_code=403, detail="No eres el cliente de esta tarea")
    if task.estado != TaskStatus.CONFIRMADA:
        raise HTTPException(status_code=400, detail="El servicio debe estar confirmado antes de calificarlo")

    accepted = db.query(Application).filter(Application.task_id == task.id, Application.estado == AppStatus.ACEPTADA).first()
    if not accepted:
        raise HTTPException(status_code=400, detail="La tarea no tiene un trabajador asignado")

    expected_worker_id = accepted.worker_id if task.tipo != "oferta" else task.cliente_id
    expected_client_id = task.cliente_id if task.tipo != "oferta" else accepted.worker_id
    if expected_client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sólo el cliente puede calificar al trabajador")
    if review.trabajador_id != expected_worker_id:
        raise HTTPException(status_code=400, detail="El trabajador indicado no corresponde a esta tarea")
    if db.query(Review).filter(Review.task_id == review.task_id).first():
        raise HTTPException(status_code=409, detail="Ya calificaste esta tarea")

    db_review = Review(task_id=task.id, cliente_id=expected_client_id, trabajador_id=expected_worker_id, rating=review.rating, calidad_trabajo=review.calidad_trabajo, trato=review.trato, puntualidad=review.puntualidad, precio_acordado=review.precio_acordado, comentario=review.comentario)
    db.add(db_review)
    db.flush()
    worker = db.query(User).filter(User.id == expected_worker_id).first()
    if worker:
        avg_rating = db.query(func.avg(Review.rating)).filter(Review.trabajador_id == worker.id).scalar()
        worker.rating = float(avg_rating or 0.0)
    db.commit()
    db.refresh(db_review)
    return db_review


@router.get("/worker/{worker_id}/summary")
def worker_reputation_summary(worker_id: str, db: Session = Depends(get_db)):
    worker = db.query(User).filter(User.id == worker_id, User.es_trabajador.is_(True)).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    return _summary(db, worker)


@router.get("/tasks/summaries")
def task_reputation_summaries(task_ids: list[str] = Query(default=[]), db: Session = Depends(get_db)):
    """Enriquece varias tarjetas de ofertas con reputación en una sola petición."""
    clean_ids = list(dict.fromkeys(str(value).strip() for value in task_ids if str(value).strip()))[:50]
    if not clean_ids:
        return {}
    rows = (
        db.query(Task, User)
        .join(User, User.id == Task.cliente_id)
        .filter(Task.id.in_(clean_ids), Task.tipo == "oferta", User.es_trabajador.is_(True))
        .all()
    )
    return {str(task.id): _summary(db, worker) for task, worker in rows}
