from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.audit_log import AuditLog
from ..models.payment import Payment, PaymentStatus, PaymentType
from ..models.user import User
from ..services.auth import get_current_admin

router = APIRouter()


def _audit(db: Session, admin: User, action: str, target_type: str, target_id: str, details: str | None = None):
    db.add(AuditLog(actor_id=admin.id, action=action, target_type=target_type, target_id=str(target_id), details=details))


@router.post("/users/{user_id}/suspend")
def suspend_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Un administrador no puede suspenderse a sí mismo")
    user.suspendido = True
    _audit(db, admin, "USER_SUSPENDED", "user", str(user.id))
    db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": True}


@router.post("/users/{user_id}/unsuspend")
def unsuspend_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.suspendido = False
    _audit(db, admin, "USER_UNSUSPENDED", "user", str(user.id))
    db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": False}


@router.get("/users/{user_id}/status")
def user_status(user_id: str, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    from fastapi import HTTPException
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"user_id": str(user.id), "suspendido": bool(user.suspendido), "verificado": bool(user.verificado), "es_admin": bool(user.es_admin), "plan": user.plan}


@router.get("/audit")
def audit_log(limit: int = 100, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    limit = max(1, min(limit, 200))
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{"id": row.id, "actor_id": row.actor_id, "action": row.action, "target_type": row.target_type, "target_id": row.target_id, "details": row.details, "created_at": row.created_at.isoformat()} for row in rows]


@router.get("/reconciliation")
def payment_reconciliation(
    start: datetime | None = None,
    end: datetime | None = None,
    moneda: str | None = None,
    tipo: PaymentType | None = None,
    estado: PaymentStatus | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Conciliación derivada exclusivamente de payments.

    Un reembolso permanece en el histórico: cuenta como volumen confirmado bruto
    y como devolución, mientras que el neto queda reducido por el reembolso.
    """
    query = db.query(Payment)
    if start is not None:
        query = query.filter(Payment.created_at >= start)
    if end is not None:
        query = query.filter(Payment.created_at <= end)
    if moneda:
        query = query.filter(Payment.moneda == moneda.upper())
    if tipo is not None:
        query = query.filter(Payment.tipo == tipo)
    if estado is not None:
        query = query.filter(Payment.estado == estado)

    rows = query.order_by(Payment.created_at.asc()).all()

    totals = {
        "confirmado_bruto": Decimal("0"),
        "reembolsado": Decimal("0"),
        "neto": Decimal("0"),
        "pendiente": Decimal("0"),
        "rechazado": Decimal("0"),
    }
    counts = {status.value: 0 for status in PaymentStatus}
    by_type: dict[str, dict[str, object]] = {}
    by_currency: dict[str, dict[str, object]] = {}

    for payment in rows:
        amount = Decimal(str(payment.monto or 0))
        status = payment.estado.value
        currency = payment.moneda
        payment_type = payment.tipo.value
        counts[status] += 1

        currency_bucket = by_currency.setdefault(currency, {"cantidad": 0, "confirmado_bruto": "0.00", "reembolsado": "0.00", "neto": "0.00", "pendiente": "0.00", "rechazado": "0.00"})
        type_bucket = by_type.setdefault(payment_type, {"cantidad": 0, "confirmado_bruto": "0.00", "reembolsado": "0.00", "neto": "0.00"})
        currency_bucket["cantidad"] += 1
        type_bucket["cantidad"] += 1

        if payment.estado in (PaymentStatus.CONFIRMADO, PaymentStatus.REEMBOLSADO):
            totals["confirmado_bruto"] += amount
            currency_bucket["confirmado_bruto"] = f"{Decimal(currency_bucket['confirmado_bruto']) + amount:.2f}"
            type_bucket["confirmado_bruto"] = f"{Decimal(type_bucket['confirmado_bruto']) + amount:.2f}"
        if payment.estado == PaymentStatus.REEMBOLSADO:
            totals["reembolsado"] += amount
            currency_bucket["reembolsado"] = f"{Decimal(currency_bucket['reembolsado']) + amount:.2f}"
            type_bucket["reembolsado"] = f"{Decimal(type_bucket['reembolsado']) + amount:.2f}"
        elif payment.estado == PaymentStatus.CONFIRMADO:
            totals["neto"] += amount
            currency_bucket["neto"] = f"{Decimal(currency_bucket['neto']) + amount:.2f}"
            type_bucket["neto"] = f"{Decimal(type_bucket['neto']) + amount:.2f}"
        elif payment.estado == PaymentStatus.PENDIENTE:
            totals["pendiente"] += amount
            currency_bucket["pendiente"] = f"{Decimal(currency_bucket['pendiente']) + amount:.2f}"
        elif payment.estado == PaymentStatus.RECHAZADO:
            totals["rechazado"] += amount
            currency_bucket["rechazado"] = f"{Decimal(currency_bucket['rechazado']) + amount:.2f}"

    return {
        "filtros": {"start": start.isoformat() if start else None, "end": end.isoformat() if end else None, "moneda": moneda.upper() if moneda else None, "tipo": tipo.value if tipo else None, "estado": estado.value if estado else None},
        "resumen": {key: f"{value:.2f}" for key, value in totals.items()},
        "conteos": counts,
        "por_tipo": by_type,
        "por_moneda": by_currency,
        "pagos_considerados": len(rows),
    }
