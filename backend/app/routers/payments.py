import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, UserPlan, UserRole
from ..models.task import Task
from ..models.payment import Payment, PaymentType, PaymentStatus
from ..models.ad import Ad
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
    "este pago, contacta al equipo de ServiCuba con el id de este pago — "
    "una vez verificado el pago (transferencia, efectivo, etc.) un "
    "administrador lo confirma manualmente y el beneficio se activa solo."
)


@router.get("/pricing")
def get_pricing():
    """Antes el precio de cada beneficio (premium, destacar, anuncio) sólo
    aparecía DESPUÉS de solicitarlo (en el toast de confirmación) — el
    usuario nunca lo veía antes de decidir. Se expone acá para que el
    frontend lo muestre de entrada, siempre leyendo de plans.py (la
    única fuente de verdad de precios) en vez de hardcodear números
    duplicados en el frontend."""
    return {
        "moneda": MONEDA_DEFECTO,
        "premium": {
            "precio": PRECIO_SUSCRIPCION_PREMIUM,
            "dias": SUSCRIPCION_PREMIUM_DIAS,
        },
        "tarea_destacada": {
            "precio": PRECIO_TAREA_DESTACADA,
            "dias": TAREA_DESTACADA_DIAS,
        },
        "anuncio": {
            "precio_por_dia": PRECIO_ANUNCIO_POR_DIA,
        },
    }


@router.post("/subscribe", response_model=PaymentResponse)
def request_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.rol != UserRole.TRABAJADOR:
        raise HTTPException(status_code=403, detail="Solo trabajadores pueden suscribirse al plan premium")

    existing = db.query(Payment).filter(
        Payment.user_id == current_user.id,
        Payment.tipo == PaymentType.SUSCRIPCION_TRABAJADOR,
        Payment.estado == PaymentStatus.PENDIENTE,
    ).first()
    if existing:
        return existing

    payment = Payment(
        user_id=current_user.id,
        tipo=PaymentType.SUSCRIPCION_TRABAJADOR,
        monto=PRECIO_SUSCRIPCION_PREMIUM,
        moneda=MONEDA_DEFECTO,
        notas=INSTRUCCIONES_PAGO,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.post("/feature-task/{task_id}", response_model=PaymentResponse)
def request_feature_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No eres el dueño de esta tarea")

    payment = Payment(
        user_id=current_user.id,
        tipo=PaymentType.TAREA_DESTACADA,
        monto=PRECIO_TAREA_DESTACADA,
        moneda=MONEDA_DEFECTO,
        referencia=str(task_id),
        notas=INSTRUCCIONES_PAGO,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.post("/sponsor-ad", response_model=PaymentResponse)
def request_sponsor_ad(
    body: SponsorAdRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.dias < 1 or body.dias > 90:
        raise HTTPException(status_code=400, detail="La duración debe ser entre 1 y 90 días")

    monto = round(PRECIO_ANUNCIO_POR_DIA * body.dias, 2)
    detalle = {
        "marca": body.marca,
        "texto": body.texto,
        "url_destino": body.url_destino,
        "categoria_id": body.categoria_id,
        "dias": body.dias,
    }
    payment = Payment(
        user_id=current_user.id,
        tipo=PaymentType.ANUNCIO,
        monto=monto,
        moneda=MONEDA_DEFECTO,
        notas=json.dumps(detalle),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/my", response_model=list[PaymentResponse])
def my_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Payment)
        .filter(Payment.user_id == current_user.id)
        .order_by(Payment.created_at.desc())
        .all()
    )


# ---------- Administración ----------

@router.get("/pending", response_model=list[PaymentResponse])
def list_pending_payments(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    return (
        db.query(Payment)
        .filter(Payment.estado == PaymentStatus.PENDIENTE)
        .order_by(Payment.created_at.asc())
        .all()
    )


@router.post("/{payment_id}/confirm", response_model=PaymentResponse)
def confirm_payment(
    payment_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.estado != PaymentStatus.PENDIENTE:
        raise HTTPException(status_code=400, detail="Este pago ya fue procesado")

    payment.estado = PaymentStatus.CONFIRMADO
    payment.confirmed_at = datetime.utcnow()

    if payment.tipo == PaymentType.SUSCRIPCION_TRABAJADOR:
        user = db.query(User).filter(User.id == payment.user_id).first()
        if user:
            base = user.plan_expira if (user.plan == UserPlan.PREMIUM and user.plan_expira and user.plan_expira > datetime.utcnow()) else datetime.utcnow()
            user.plan = UserPlan.PREMIUM
            user.plan_expira = base + timedelta(days=SUSCRIPCION_PREMIUM_DIAS)

    elif payment.tipo == PaymentType.TAREA_DESTACADA:
        task = db.query(Task).filter(Task.id == payment.referencia).first()
        if task:
            task.destacada = True
            task.destacada_hasta = datetime.utcnow() + timedelta(days=TAREA_DESTACADA_DIAS)

    elif payment.tipo == PaymentType.ANUNCIO:
        detalle = json.loads(payment.notas) if payment.notas else {}
        dias = detalle.get("dias", 7)
        ad = Ad(
            marca=detalle.get("marca", "—"),
            texto=detalle.get("texto", ""),
            url_destino=detalle.get("url_destino"),
            categoria_id=detalle.get("categoria_id"),
            activo=True,
            fecha_inicio=datetime.utcnow(),
            fecha_fin=datetime.utcnow() + timedelta(days=dias),
            payment_id=payment.id,
        )
        db.add(ad)

    db.commit()
    db.refresh(payment)
    return payment


@router.post("/{payment_id}/reject", response_model=PaymentResponse)
def reject_payment(
    payment_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.estado != PaymentStatus.PENDIENTE:
        raise HTTPException(status_code=400, detail="Este pago ya fue procesado")
    payment.estado = PaymentStatus.RECHAZADO
    payment.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(payment)
    return payment
