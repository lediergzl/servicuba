from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.audit_log import AuditLog
from ..models.payment import Payment, PaymentStatus, PaymentType
from ..models.report import Report, ReportStatus
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..services.auth import get_current_admin, get_optional_current_user

router = APIRouter()


def _audit(db: Session, admin: User, action: str, target_type: str, target_id: str, details: str | None = None):
    db.add(AuditLog(actor_id=admin.id, action=action, target_type=target_type, target_id=str(target_id), details=details))


@router.get("/status")
def admin_status(current_user: User | None = Depends(get_optional_current_user)):
    """Cheap capability probe used by the SPA.

    A non-admin (including a logged-out visitor) is a normal negative result,
    not an authorization error. This prevents the frontend from generating a
    403 on every app load while the actual admin endpoints remain protected by
    get_current_admin below.
    """
    if not current_user or not current_user.es_admin:
        return {"authorized": False, "es_admin": False}
    return {"authorized": True, "es_admin": True, "user_id": str(current_user.id)}


@router.get("/metrics")
def admin_metrics(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    task_counts = {str(status.value): 0 for status in TaskStatus}
    for status, count in db.query(Task.estado, func.count(Task.id)).group_by(Task.estado).all():
        task_counts[str(status.value)] = int(count)
    report_counts = {str(status.value): 0 for status in ReportStatus}
    for status, count in db.query(Report.status, func.count(Report.id)).group_by(Report.status).all():
        report_counts[str(status.value)] = int(count)
    return {
        "usuarios": int(db.query(func.count(User.id)).scalar() or 0),
        "trabajadores": int(db.query(func.count(User.id)).filter(User.es_trabajador.is_(True), User.suspendido.is_(False)).scalar() or 0),
        "usuarios_suspendidos": int(db.query(func.count(User.id)).filter(User.suspendido.is_(True)).scalar() or 0),
        "publicaciones": int(db.query(func.count(Task.id)).scalar() or 0),
        "tareas_por_estado": task_counts,
        "denuncias": report_counts,
    }


@router.get("/users")
def admin_users(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    limit = max(1, min(limit, 200)); offset = max(0, offset)
    rows = db.query(User).order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    return [{
        "id": str(user.id), "nombre": user.nombre, "telefono": user.telefono,
        "es_admin": bool(user.es_admin), "es_trabajador": bool(user.es_trabajador),
        "suspendido": bool(user.suspendido), "verificado": bool(user.verificado),
        "plan": getattr(user.plan, "value", user.plan),
        "municipio": user.municipio,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    } for user in rows]


@router.get("/moderation/reports")
def moderation_reports(status: ReportStatus | None = None, limit: int = 100, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    limit = max(1, min(limit, 200))
    query = db.query(Report, Task, User).join(Task, Task.id == Report.task_id).join(User, User.id == Report.reporter_id)
    if status: query = query.filter(Report.status == status)
    rows = query.order_by(Report.created_at.asc()).limit(limit).all()
    return [{"id": str(report.id), "task_id": str(task.id), "task_title": task.titulo, "task_type": task.tipo, "task_status": task.estado.value, "reason": report.reason.value, "details": report.details, "status": report.status.value, "reporter_id": str(reporter.id), "reporter_name": reporter.nombre, "created_at": report.created_at.isoformat() if report.created_at else None, "reviewed_at": report.reviewed_at.isoformat() if report.reviewed_at else None, "moderator_note": report.moderator_note} for report, task, reporter in rows]


@router.post("/moderation/reports/{report_id}/dismiss")
def dismiss_report(report_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report: raise HTTPException(status_code=404, detail="Denuncia no encontrada")
    report.status = ReportStatus.DESCARTADA; report.reviewed_by = admin.id; report.reviewed_at = datetime.utcnow(); _audit(db, admin, "REPORT_DISMISSED", "report", report_id); db.commit()
    return {"ok": True, "status": report.status.value}


@router.post("/moderation/reports/{report_id}/hide")
def hide_reported_task(report_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report: raise HTTPException(status_code=404, detail="Denuncia no encontrada")
    task = db.query(Task).filter(Task.id == report.task_id).first()
    if not task: raise HTTPException(status_code=404, detail="Publicación no encontrada")
    task.estado = TaskStatus.CANCELADA; report.status = ReportStatus.ACCIONADA; report.reviewed_by = admin.id; report.reviewed_at = datetime.utcnow(); _audit(db, admin, "TASK_HIDDEN_BY_MODERATION", "task", str(task.id), details=f"report:{report_id}"); db.commit()
    return {"ok": True, "task_id": str(task.id), "task_status": task.estado.value, "report_status": report.status.value}


@router.post("/moderation/reports/{report_id}/restore")
def restore_reported_task(report_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report: raise HTTPException(status_code=404, detail="Denuncia no encontrada")
    task = db.query(Task).filter(Task.id == report.task_id).first()
    if not task: raise HTTPException(status_code=404, detail="Publicación no encontrada")
    task.estado = TaskStatus.ACTIVA; report.status = ReportStatus.REVISADA; report.reviewed_by = admin.id; report.reviewed_at = datetime.utcnow(); _audit(db, admin, "TASK_RESTORED_BY_MODERATION", "task", str(task.id), details=f"report:{report_id}"); db.commit()
    return {"ok": True, "task_id": str(task.id), "task_status": task.estado.value, "report_status": report.status.value}


@router.post("/moderation/reports/{report_id}/suspend-user")
def suspend_reported_user(report_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report: raise HTTPException(status_code=404, detail="Denuncia no encontrada")
    task = db.query(Task).filter(Task.id == report.task_id).first()
    if not task: raise HTTPException(status_code=404, detail="Publicación no encontrada")
    user = db.query(User).filter(User.id == task.cliente_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id: raise HTTPException(status_code=400, detail="Un administrador no puede suspenderse a sí mismo")
    user.suspendido = True; task.estado = TaskStatus.CANCELADA; report.status = ReportStatus.ACCIONADA; report.reviewed_by = admin.id; report.reviewed_at = datetime.utcnow(); _audit(db, admin, "USER_SUSPENDED_FROM_REPORT", "user", str(user.id), details=f"report:{report_id}"); db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": True}


@router.post("/users/{user_id}/suspend")
def suspend_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id: raise HTTPException(status_code=400, detail="Un administrador no puede suspenderse a sí mismo")
    user.suspendido = True; _audit(db, admin, "USER_SUSPENDED", "user", str(user.id)); db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": True}


@router.post("/users/{user_id}/unsuspend")
def unsuspend_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.suspendido = False; _audit(db, admin, "USER_UNSUSPENDED", "user", str(user.id)); db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": False}


@router.get("/users/{user_id}/status")
def user_status(user_id: str, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"user_id": str(user.id), "suspendido": bool(user.suspendido), "verificado": bool(user.verificado), "es_admin": bool(user.es_admin), "plan": getattr(user.plan, "value", user.plan)}


@router.get("/audit")
def audit_log(limit: int = 100, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    limit = max(1, min(limit, 200)); rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{"id": row.id, "actor_id": row.actor_id, "action": row.action, "target_type": row.target_type, "target_id": row.target_id, "details": row.details, "created_at": row.created_at.isoformat()} for row in rows]


@router.get("/reconciliation")
def payment_reconciliation(start: datetime | None = None, end: datetime | None = None, moneda: str | None = None, tipo: PaymentType | None = None, estado: PaymentStatus | None = None, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    query = db.query(Payment)
    if start is not None: query = query.filter(Payment.created_at >= start)
    if end is not None: query = query.filter(Payment.created_at <= end)
    if moneda: query = query.filter(Payment.moneda == moneda.upper())
    if tipo is not None: query = query.filter(Payment.tipo == tipo)
    if estado is not None: query = query.filter(Payment.estado == estado)
    rows = query.order_by(Payment.created_at.asc()).all(); counts = {s.value: 0 for s in PaymentStatus}; by_currency = {}; by_type = {}
    def bucket(): return {"cantidad": 0, "confirmado_bruto": "0.00", "reembolsado": "0.00", "neto": "0.00", "pendiente": "0.00", "rechazado": "0.00"}
    for payment in rows:
        amount = Decimal(str(payment.monto or 0)); currency = payment.moneda.upper(); status = payment.estado; counts[status.value] += 1
        cb = by_currency.setdefault(currency, bucket()); tb = by_type.setdefault(payment.tipo.value, {}).setdefault(currency, bucket()); cb["cantidad"] += 1; tb["cantidad"] += 1
        if status in (PaymentStatus.CONFIRMADO, PaymentStatus.REEMBOLSADO): cb["confirmado_bruto"] = f"{Decimal(cb['confirmado_bruto']) + amount:.2f}"; tb["confirmado_bruto"] = f"{Decimal(tb['confirmado_bruto']) + amount:.2f}"
        if status == PaymentStatus.REEMBOLSADO: cb["reembolsado"] = f"{Decimal(cb['reembolsado']) + amount:.2f}"; tb["reembolsado"] = f"{Decimal(tb['reembolsado']) + amount:.2f}"
        elif status == PaymentStatus.CONFIRMADO: cb["neto"] = f"{Decimal(cb['neto']) + amount:.2f}"; tb["neto"] = f"{Decimal(tb['neto']) + amount:.2f}"
        elif status == PaymentStatus.PENDIENTE: cb["pendiente"] = f"{Decimal(cb['pendiente']) + amount:.2f}"; tb["pendiente"] = f"{Decimal(tb['pendiente']) + amount:.2f}"
        elif status == PaymentStatus.RECHAZADO: cb["rechazado"] = f"{Decimal(cb['rechazado']) + amount:.2f}"; tb["rechazado"] = f"{Decimal(tb['rechazado']) + amount:.2f}"
    return {"filtros": {"start": start.isoformat() if start else None, "end": end.isoformat() if end else None, "moneda": moneda.upper() if moneda else None, "tipo": tipo.value if tipo else None, "estado": estado.value if estado else None}, "resumen": by_currency, "conteos": counts, "por_tipo": by_type, "por_moneda": by_currency, "pagos_considerados": len(rows)}
