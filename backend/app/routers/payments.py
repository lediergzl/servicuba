import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, UserPlan
from ..models.task import Task
from ..models.payment import Payment, PaymentType, PaymentStatus
from ..models.ad import Ad
from ..models.audit_log import AuditLog
from ..schemas.payment import SponsorAdRequest, PaymentResponse
from ..services.auth import get_current_user, get_current_admin
from ..services.plans import (
    PRECIO_SUSCRIPCION_PREMIUM, SUSCRIPCION_PREMIUM_DIAS,
    PRECIO_TAREA_DESTACADA, TAREA_DESTACADA_DIAS,
    PRECIO_ANUNCIO_POR_DIA, MONEDA_DEFECTO,
)

router = APIRouter()
INSTRUCCIONES_PAGO = (
    "Todavía no hay una pasarela de pago digital conectada. Para confirmar "
    "este pago, contacta al equipo de ServiCuba con el id de este pago."
)


def _lock_user(db: Session, user_id):
    return db.query(User).filter(User.id == user_id).with_for_update().first()


def _audit(db: Session, admin: User, action: str, payment: Payment, details: str | None = None):
    db.add(AuditLog(actor_id=admin.id, action=action, target_type="payment",
                    target_id=str(payment.id), details=details))


def _get_locked_payment(db: Session, payment_id: str):
    return db.query(Payment).filter(Payment.id == payment_id).with_for_update().first()


@router.get("/pricing")
def get_pricing():
    return {"moneda": MONEDA_DEFECTO,
            "premium": {"precio": PRECIO_SUSCRIPCION_PREMIUM, "dias": SUSCRIPCION_PREMIUM_DIAS},
            "tarea_destacada": {"precio": PRECIO_TAREA_DESTACADA, "dias": TAREA_DESTACADA_DIAS},
            "anuncio": {"precio_por_dia": PRECIO_ANUNCIO_POR_DIA}}


@router.post("/subscribe", response_model=PaymentResponse)
def request_subscription(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.es_trabajador:
        raise HTTPException(status_code=403, detail="Activa tu perfil de trabajador para suscribirte al plan premium")
    if not _lock_user(db, current_user.id):
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    existing = db.query(Payment).filter(Payment.user_id == current_user.id,
        Payment.tipo == PaymentType.SUSCRIPCION_TRABAJADOR,
        Payment.estado == PaymentStatus.PENDIENTE).first()
    if existing:
        return existing
    payment = Payment(user_id=current_user.id, tipo=PaymentType.SUSCRIPCION_TRABAJADOR,
                      monto=PRECIO_SUSCRIPCION_PREMIUM, moneda=MONEDA_DEFECTO, notas=INSTRUCCIONES_PAGO)
    db.add(payment)
    db.commit(); db.refresh(payment)
    return payment


@router.post("/feature-task/{task_id}", response_model=PaymentResponse)
def request_feature_task(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el dueño de esta tarea")
    existing = db.query(Payment).filter(Payment.user_id == current_user.id,
        Payment.tipo == PaymentType.TAREA_DESTACADA, Payment.referencia == str(task_id),
        Payment.estado == PaymentStatus.PENDIENTE).first()
    if existing:
        return existing
    payment = Payment(user_id=current_user.id, tipo=PaymentType.TAREA_DESTACADA,
        monto=PRECIO_TAREA_DESTACADA, moneda=MONEDA_DEFECTO, referencia=str(task_id), notas=INSTRUCCIONES_PAGO)
    db.add(payment); db.commit(); db.refresh(payment)
    return payment


@router.post("/sponsor-ad", response_model=PaymentResponse)
def request_sponsor_ad(body: SponsorAdRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if body.dias < 1 or body.dias > 90:
        raise HTTPException(status_code=400, detail="La duración debe ser entre 1 y 90 días")
    if not body.url_destino and not body.contacto:
        raise HTTPException(status_code=400, detail="Agrega un enlace o un teléfono/WhatsApp de contacto.")
    monto = round(PRECIO_ANUNCIO_POR_DIA * body.dias, 2)
    detalle = {"marca": body.marca, "texto": body.texto, "url_destino": body.url_destino,
               "contacto": body.contacto, "categoria_id": body.categoria_id, "dias": body.dias}
    payment = Payment(user_id=current_user.id, tipo=PaymentType.ANUNCIO, monto=monto,
                      moneda=MONEDA_DEFECTO, notas=json.dumps(detalle))
    db.add(payment); db.commit(); db.refresh(payment)
    return payment


@router.get("/my", response_model=list[PaymentResponse])
def my_payments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Payment).filter(Payment.user_id == current_user.id).order_by(Payment.created_at.desc()).all()


@router.get("/pending", response_model=list[PaymentResponse])
def list_pending_payments(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    return db.query(Payment).filter(Payment.estado == PaymentStatus.PENDIENTE).order_by(Payment.created_at.asc()).all()


@router.post("/{payment_id}/confirm", response_model=PaymentResponse)
def confirm_payment(payment_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    payment = _get_locked_payment(db, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.estado != PaymentStatus.PENDIENTE:
        raise HTTPException(status_code=400, detail="Este pago ya fue procesado")

    now = datetime.utcnow()
    try:
        if payment.tipo == PaymentType.SUSCRIPCION_TRABAJADOR:
            user = _lock_user(db, payment.user_id)
            if not user:
                raise HTTPException(status_code=409, detail="El usuario asociado al pago ya no existe")
            base = user.plan_expira if user.plan == UserPlan.PREMIUM and user.plan_expira and user.plan_expira > now else now
            user.plan = UserPlan.PREMIUM
            user.plan_expira = base + timedelta(days=SUSCRIPCION_PREMIUM_DIAS)
        elif payment.tipo == PaymentType.TAREA_DESTACADA:
            task = db.query(Task).filter(Task.id == payment.referencia).with_for_update().first()
            if not task:
                raise HTTPException(status_code=409, detail="La tarea asociada al pago ya no existe")
            task.destacada = True
            task.destacada_hasta = now + timedelta(days=TAREA_DESTACADA_DIAS)
        elif payment.tipo == PaymentType.ANUNCIO:
            try:
                detalle = json.loads(payment.notas) if payment.notas else {}
            except (TypeError, json.JSONDecodeError):
                raise HTTPException(status_code=409, detail="Los datos del anuncio asociado al pago no son válidos")
            dias = detalle.get("dias", 7)
            if not isinstance(dias, int) or not 1 <= dias <= 90:
                raise HTTPException(status_code=409, detail="La duración del anuncio asociado al pago no es válida")
            db.add(Ad(marca=detalle.get("marca", "—"), texto=detalle.get("texto", ""),
                      url_destino=detalle.get("url_destino"), contacto=detalle.get("contacto"),
                      categoria_id=detalle.get("categoria_id"), activo=True, fecha_inicio=now,
                      fecha_fin=now + timedelta(days=dias), payment_id=payment.id))
        payment.estado = PaymentStatus.CONFIRMADO
        payment.confirmed_at = now
        _audit(db, admin, "PAYMENT_CONFIRMED", payment)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    db.refresh(payment)
    return payment


@router.post("/{payment_id}/reject", response_model=PaymentResponse)
def reject_payment(payment_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    payment = _get_locked_payment(db, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.estado != PaymentStatus.PENDIENTE:
        raise HTTPException(status_code=400, detail="Este pago ya fue procesado")
    payment.estado = PaymentStatus.RECHAZADO
    payment.confirmed_at = datetime.utcnow()
    _audit(db, admin, "PAYMENT_REJECTED", payment)
    db.commit(); db.refresh(payment)
    return payment


@router.post("/{payment_id}/refund", response_model=PaymentResponse)
def refund_payment(payment_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    payment = _get_locked_payment(db, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.estado != PaymentStatus.CONFIRMADO:
        raise HTTPException(status_code=400, detail="Solo se puede reembolsar un pago confirmado")
    # Refunds are deliberately explicit and idempotent. A payment cannot be
    # refunded twice because the state transition is serialized by FOR UPDATE.
    payment.estado = PaymentStatus.RECHAZADO
    payment.notas = (payment.notas or "") + "\nREFUND_PROCESSED"
    payment.confirmed_at = datetime.utcnow()
    _audit(db, admin, "PAYMENT_REFUNDED", payment)
    db.commit(); db.refresh(payment)
    return payment
