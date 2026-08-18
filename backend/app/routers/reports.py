from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.report import Report, ReportReason, ReportStatus
from ..models.task import Task
from ..models.user import User
from ..services.auth import get_current_user

router = APIRouter()


class ReportCreate(BaseModel):
    reason: ReportReason
    details: str | None = Field(default=None, max_length=1000)


@router.post("/tasks/{task_id}")
def create_report(
    task_id: str,
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if task.cliente_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes denunciar tu propia publicación")

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
    return {"ok": True, "report_id": str(report.id), "status": report.status.value}
