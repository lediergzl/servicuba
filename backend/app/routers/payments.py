import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models.user import User, UserPlan
from ..models.task import Task
from ..models.payment import Payment, PaymentType, PaymentStatus
from ..models.ad import Ad
from ..models.audit_log import AuditLog
from ..schemas.payment import SponsorAdRequest, PaymentResponse
from ..services.auth import get_current_user, get_current_admin
from ..services.plans import (
    PRECIO_SUSCRIPCION_PREMIUM,
    SUSCRIPCION_PREMIUM_DIAS,
    PRECIO_TAREA_DESTACADA,
    TAREA_DESTACADA_DIAS,
    PRECIO_ANUNCIO_POR_DIA,
    PLAN_PREMIUM_ANUNCIOS_DIA,
    MONEDA_DEFECTO,
    is_premium_active,
)

router = APIRouter()
INSTRUCCIONES_PAGO = "Todavía no hay una pasarela de pago digital conectada. Para confirmar este pago, contacta al equipo de ServiCuba con el id de este pago."

def _lock_user(db, user_id): return db.query(User).filter(User.id == user_id).with_for_update().first()
def _audit(db, admin, action, payment, details=None): db.add(AuditLog(actor_id=admin.id, action=action, target_type="payment", target_id=str(payment.id), details=details))
def _get_locked_payment(db, payment_id): return db.query(Payment).filter(Payment.id == payment_id).with_for_update().first()

def _anuncios_solicitados_hoy(db: Session, user_id) -> int:
    """Cuenta solicitudes de anuncios desde medianoche UTC.

    El límite se aplica al momento de solicitar el anuncio, no al momento
    de aprobarlo, para evitar que una cuenta Premium cree una cola infinita
    de anuncios pendientes y luego los active todos de golpe.
    """
    inicio = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(func.count(Payment.id))
        .filter(
            Payment.user_id == user_id,
            Payment.tipo == PaymentType.ANUNCIO,
            Payment.created_at >= inicio,
            Payment.estado.notin_([PaymentStatus.RECHAZADO, PaymentStatus.REEMBOLSADO]),
        )
        .scalar()
        or 0
    )

@router.get("/pricing")
def get_pricing():
    return {
        "moneda": MONEDA_DEFECTO,
        "premium": {"precio": PRECIO_SUSCRIPCION_PREMIUM, "dias": SUSCRIPCION_PREMIUM_DIAS},
        "tarea_destacada": {"precio": PRECIO_TAREA_DESTACADA, "dias": TAREA_DESTACADA_DIAS},
        "anuncio": {"precio_por_dia": PRECIO_ANUNCIO_POR_DIA, "limite_diario": PLAN_PREMIUM_ANUNCIOS_DIA},
    }

@router.post("/subscribe", response_model=PaymentResponse)
def request_subscription(db=Depends(get_db), current_user=Depends(get_current_user)):
    if not current_user.es_trabajador: raise HTTPException(status_code=403, detail="Activa tu perfil de trabajador para suscribirte al plan premium")
    if not _lock_user(db, current_user.id): raise HTTPException(status_code=401, detail="Usuario no encontrado")
    existing = db.query(Payment).filter(Payment.user_id == current_user.id, Payment.tipo == PaymentType.SUSCRIPCION_TRABAJADOR, Payment.estado == PaymentStatus.PENDIENTE).first()
    if existing: return existing
    payment = Payment(user_id=current_user.id, tipo=PaymentType.SUSCRIPCION_TRABAJADOR, monto=PRECIO_SUSCRIPCION_PREMIUM, moneda=MONEDA_DEFECTO, notas=INSTRUCCIONES_PAGO)
    db.add(payment); db.commit(); db.refresh(payment); return payment

@router.post("/feature-task/{task_id}", response_model=PaymentResponse)
def request_feature_task(task_id, db=Depends(get_db), current_user=Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.cliente_id != current_user.id: raise HTTPException(status_code=403, detail="No eres el dueño de esta tarea")
    existing = db.query(Payment).filter(Payment.user_id == current_user.id, Payment.tipo == PaymentType.TAREA_DESTACADA, Payment.referencia == str(task_id), Payment.estado == PaymentStatus.PENDIENTE).first()
    if existing: return existing
    payment = Payment(user_id=current_user.id, tipo=PaymentType.TAREA_DESTACADA, monto=PRECIO_TAREA_DESTACADA, moneda=MONEDA_DEFECTO, referencia=str(task_id), notas=INSTRUCCIONES_PAGO)
    db.add(payment); db.commit(); db.refresh(payment); return payment

@router.post("/sponsor-ad", response_model=PaymentResponse)
def request_sponsor_ad(body: SponsorAdRequest, db=Depends(get_db), current_user=Depends(get_current_user)):
    # Los anuncios son una superficie comercial Premium; no deben convertirse
    # en un canal gratuito que transforme el marketplace en un Revolico.
    if not current_user.es_trabajador:
        raise HTTPException(status_code=403, detail="Los anuncios están reservados a profesionales")
    if not is_premium_active(current_user):
        raise HTTPException(status_code=403, detail="Los anuncios promocionales están disponibles sólo para cuentas Premium")

    usados = _anuncios_solicitados_hoy(db, current_user.id)
    if usados >= PLAN_PREMIUM_ANUNCIOS_DIA:
        raise HTTPException(
            status_code=429,
            detail=f"Tu plan Premium permite solicitar hasta {PLAN_PREMIUM_ANUNCIOS_DIA} anuncios por día. Vuelve a intentarlo mañana.",
        )

    if body.dias < 1 or body.dias > 90: raise HTTPException(status_code=400, detail="La duración debe ser entre 1 y 90 días")
    if not body.url_destino and not body.contacto: raise HTTPException(status_code=400, detail="Agrega un enlace o un teléfono/WhatsApp de contacto.")
    monto = round(PRECIO_ANUNCIO_POR_DIA * body.dias, 2)
    detalle = {
        "marca": body.marca,
        "texto": body.texto,
        "url_destino": body.url_destino,
        "contacto": body.contacto,
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
    db.add(payment); db.commit(); db.refresh(payment); return payment

@router.get("/my", response_model=list[PaymentResponse])
def my_payments(db=Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(Payment).filter(Payment.user_id == current_user.id).order_by(Payment.created_at.desc()).all()

@router.get("/pending", response_model=list[PaymentResponse])
def list_pending_payments(db=Depends(get_db), _admin=Depends(get_current_admin)):
    return db.query(Payment).filter(Payment.estado == PaymentStatus.PENDIENTE).order_by(Payment.created_at.asc()).all()

@router.post("/{payment_id}/confirm", response_model=PaymentResponse)
def confirm_payment(payment_id, db=Depends(get_db), admin=Depends(get_current_admin)):
    payment = _get_locked_payment(db, payment_id)
    if not payment: raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.estado != PaymentStatus.PENDIENTE: raise HTTPException(status_code=400, detail="Este pago ya fue procesado")
    now = datetime.utcnow()
    try:
        if payment.tipo == PaymentType.SUSCRIPCION_TRABAJADOR:
            user = _lock_user(db, payment.user_id)
            if not user: raise HTTPException(status_code=409, detail="El usuario asociado al pago ya no existe")
            base = user.plan_expira if user.plan == UserPlan.PREMIUM and user.plan_expira and user.plan_expira > now else now
            user.plan = UserPlan.PREMIUM; user.plan_expira = base + timedelta(days=SUSCRIPCION_PREMIUM_DIAS)
            payment.entitlement_expires_at = user.plan_expira
        elif payment.tipo == PaymentType.TAREA_DESTACADA:
            task = db.query(Task).filter(Task.id == payment.referencia).with_for_update().first()
            if not task: raise HTTPException(status_code=409, detail="La tarea asociada al pago ya no existe")
            task.destacada = True; task.destacada_hasta = now + timedelta(days=TAREA_DESTACADA_DIAS)
            payment.entitlement_expires_at = task.destacada_hasta
        elif payment.tipo == PaymentType.ANUNCIO:
            try: detalle = json.loads(payment.notas) if payment.notas else {}
            except (TypeError, json.JSONDecodeError): raise HTTPException(status_code=409, detail="Los datos del anuncio asociado al pago no son válidos")
            dias = detalle.get("dias", 7)
            if not isinstance(dias, int) or not 1 <= dias <= 90: raise HTTPException(status_code=409, detail="La duración del anuncio asociado al pago no es válida")
            expiry = now + timedelta(days=dias)
            # Pagar confirma la solicitud comercial, pero NO publica el
            # contenido automáticamente. Todo anuncio entra inactivo y debe
            # ser revisado/activado por moderación, igual que cualquier otra
            # superficie visible de la plataforma.
            db.add(Ad(
                marca=detalle.get("marca", "—"),
                texto=detalle.get("texto", ""),
                url_destino=detalle.get("url_destino"),
                contacto=detalle.get("contacto"),
                categoria_id=detalle.get("categoria_id"),
                activo=False,
                fecha_inicio=now,
                fecha_fin=expiry,
                payment_id=payment.id,
            ))
            payment.entitlement_expires_at = expiry
        payment.estado = PaymentStatus.CONFIRMADO; payment.confirmed_at = now; _audit(db, admin, "PAYMENT_CONFIRMED", payment); db.commit()
    except HTTPException: db.rollback(); raise
    except Exception: db.rollback(); raise
    db.refresh(payment); return payment

@router.post("/{payment_id}/reject", response_model=PaymentResponse)
def reject_payment(payment_id, db=Depends(get_db), admin=Depends(get_current_admin)):
    payment = _get_locked_payment(db, payment_id)
    if not payment: raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.estado != PaymentStatus.PENDIENTE: raise HTTPException(status_code=400, detail="Este pago ya fue procesado")
    now = datetime.utcnow()
    try:
        payment.estado = PaymentStatus.RECHAZADO
        payment.confirmed_at = now
        _audit(db, admin, "PAYMENT_REJECTED", payment)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(payment); return payment

@router.post("/{payment_id}/refund", response_model=PaymentResponse)
def refund_payment(payment_id, db=Depends(get_db), admin=Depends(get_current_admin)):
    payment = _get_locked_payment(db, payment_id)
    if not payment: raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.estado == PaymentStatus.REEMBOLSADO: raise HTTPException(status_code=400, detail="Este pago ya fue reembolsado")
    if payment.estado != PaymentStatus.CONFIRMADO: raise HTTPException(status_code=400, detail="Solo se puede reembolsar un pago confirmado")
    now = datetime.utcnow()
    if payment.tipo == PaymentType.SUSCRIPCION_TRABAJADOR:
        user = _lock_user(db, payment.user_id)
        if user and user.plan == UserPlan.PREMIUM:
            other_expiries = db.query(Payment.entitlement_expires_at).filter(Payment.user_id == user.id, Payment.tipo == PaymentType.SUSCRIPCION_TRABAJADOR, Payment.estado == PaymentStatus.CONFIRMADO, Payment.id != payment.id).all()
            max_expiry = max((row[0] for row in other_expiries if row[0]), default=None)
            if max_expiry and max_expiry > now: user.plan_expira = max_expiry
            else: user.plan = UserPlan.GRATIS; user.plan_expira = None
    elif payment.tipo == PaymentType.TAREA_DESTACADA:
        task = db.query(Task).filter(Task.id == payment.referencia).with_for_update().first()
        if task and task.destacada and task.destacada_hasta == payment.entitlement_expires_at: task.destacada = False; task.destacada_hasta = None
    elif payment.tipo == PaymentType.ANUNCIO:
        ad = db.query(Ad).filter(Ad.payment_id == payment.id).with_for_update().first()
        if ad: ad.activo = False
    payment.estado = PaymentStatus.REEMBOLSADO; payment.confirmed_at = now; _audit(db, admin, "PAYMENT_REFUNDED", payment); db.commit(); db.refresh(payment); return payment