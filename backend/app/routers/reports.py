from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.report import Report, ReportReason
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..services.auth import get_current_user

router = APIRouter()


class ReportRequest(BaseModel):
    reason: ReportReason
    details: str | None = Field(default=None, max_length=1000)


@router.get("/reasons")
def report_reasons():
    labels = {
        ReportReason.SPAM: "Spam o contenido repetitivo",
        ReportReason.INAPROPIADO: "Contenido inapropiado",
        ReportReason.ESTAFA: "Posible estafa o fraude",
        ReportReason.FUERA_DE_PROPOSITO: "No corresponde a un servicio",
        ReportReason.OTRO: "Otro motivo",
    }
    return [{"value": reason.value, "label": labels[reason]} for reason in ReportReason]


@router.post("/{task_id}")
def create_report(
    task_id: str,
    payload: ReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if task.cliente_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes denunciar tu propia publicación")
    if task.estado == TaskStatus.CANCELADA:
        raise HTTPException(status_code=400, detail="Esta publicación ya no está disponible")
    if db.query(Report).filter(Report.task_id == task.id, Report.reporter_id == current_user.id).first():
        raise HTTPException(status_code=409, detail="Ya denunciaste esta publicación")

    report = Report(
        task_id=task.id,
        reporter_id=current_user.id,
        reason=payload.reason,
        details=(payload.details or "").strip() or None,
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya denunciaste esta publicación")
    db.refresh(report)
    return {"ok": True, "report_id": str(report.id), "status": report.status.value,
            "message": "Denuncia recibida. Nuestro equipo la revisará."}
