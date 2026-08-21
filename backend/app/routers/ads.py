import json
import random
from datetime import datetime, timedelta
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.ad import Ad
from ..models.payment import Payment, PaymentType, PaymentStatus
from ..schemas.ad import AdResponse, PromotionalAdCreate
from ..services.auth import get_current_user, get_current_admin
from ..services.plans import can_create_promotional_ads, PRECIO_ANUNCIO_POR_DIA, MONEDA_DEFECTO

router = APIRouter()


def _elegir_sin_repetir(candidatos, excluidos):
    if not candidatos:
        return None
    pool = [a for a in candidatos if str(a.id) not in excluidos] or candidatos
    return random.choice(pool)


@router.post("/promotional", response_model=AdResponse, status_code=201, summary="Crear anuncio promocional PREMIUM")
def create_promotional_ad(payload: PromotionalAdCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not can_create_promotional_ads(current_user):
        raise HTTPException(status_code=403, detail="Los anuncios promocionales son exclusivos del plan PREMIUM activo")
    # El anuncio y su cobro nacen juntos, pero permanecen fuera de circulación
    # hasta que administración confirme el pago y apruebe la publicación.
    payment = Payment(user_id=current_user.id, tipo=PaymentType.ANUNCIO, estado=PaymentStatus.PENDIENTE, monto=PRECIO_ANUNCIO_POR_DIA, moneda=MONEDA_DEFECTO, notas=json.dumps({"dias": 1, "origen": "anuncio_promocional"}))
    db.add(payment)
    db.flush()
    ad = Ad(owner_id=current_user.id, marca=current_user.nombre, titulo=payload.titulo, texto=payload.descripcion, imagen=payload.imagen, precio_servicio=payload.precio_servicio, contacto=payload.contacto or current_user.telefono, categoria_id=payload.categoria_id, estado="pendiente_pago", activo=False, payment_id=payment.id)
    db.add(ad); db.commit(); db.refresh(ad)
    return ad


@router.get("/mine", response_model=list[AdResponse], summary="Mis anuncios promocionales")
def get_my_ads(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Ad).filter(Ad.owner_id == current_user.id).order_by(Ad.created_at.desc()).all()


@router.get("/active", response_model=AdResponse | None)
def get_active_ad(category_id: int | None = None, excluir: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    now = datetime.utcnow()
    q = db.query(Ad).filter(Ad.activo == True, Ad.estado == "activo", Ad.fecha_inicio <= now, Ad.fecha_fin >= now)
    excluded = {x.strip() for x in excluir.split(",")} if excluir else set(); excluded.discard("")
    ad = None
    if category_id is not None:
        # Preferimos un anuncio dirigido a la categoría que el usuario está
        # mirando ahora mismo (más relevante), pero eso es sólo una
        # preferencia, no un requisito.
        ad = _elegir_sin_repetir(q.filter(Ad.categoria_id == category_id).all(), excluded)
    if ad is None:
        # Un anuncio pagado debe tener visibilidad real: antes, si no
        # coincidía exactamente la categoría filtrada, sólo se mostraban
        # los anuncios SIN categoría asignada (categoria_id IS NULL). Eso
        # dejaba a cualquier anuncio dirigido a un oficio específico sin
        # aparecer nunca fuera de esa categoría exacta — incluyendo la
        # vista "Todas", donde antes no se mostraba ningún anuncio con
        # categoría. Ahora cualquier anuncio activo cuenta como candidato.
        ad = _elegir_sin_repetir(q.all(), excluded)
    if ad is None: return None
    ad.impresiones += 1; db.commit(); db.refresh(ad); return ad


@router.post("/{ad_id}/click")
def register_click(ad_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ad = db.query(Ad).filter(Ad.id == ad_id).first()
    if not ad: raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    ad.clics += 1; db.commit(); return {"url_destino": ad.url_destino, "contacto": ad.contacto}


@router.get("/", response_model=list[AdResponse])
def list_ads(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    return db.query(Ad).order_by(Ad.created_at.desc()).all()


@router.post("/{ad_id}/approve", response_model=AdResponse, summary="Aprobar anuncio tras confirmar pago")
def approve_ad(ad_id: UUID, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    ad = db.query(Ad).filter(Ad.id == ad_id).with_for_update().first()
    if not ad: raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    payment = db.query(Payment).filter(Payment.id == ad.payment_id).first() if ad.payment_id else None
    if not payment or payment.estado != PaymentStatus.CONFIRMADO:
        raise HTTPException(status_code=409, detail="Confirma el pago antes de aprobar el anuncio")
    now = datetime.utcnow(); days = 1
    try: days = max(1, min(90, int(json.loads(payment.notas or "{}").get("dias", 1))))
    except (TypeError, ValueError, json.JSONDecodeError): pass
    ad.fecha_inicio = now; ad.fecha_fin = now + timedelta(days=days); ad.activo = True; ad.estado = "activo"; payment.entitlement_expires_at = ad.fecha_fin
    db.commit(); db.refresh(ad); return ad


@router.post("/{ad_id}/toggle", response_model=AdResponse)
def toggle_ad(ad_id: UUID, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    ad = db.query(Ad).filter(Ad.id == ad_id).with_for_update().first()
    if not ad: raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    if not ad.activo: return approve_ad(ad_id, db, admin)
    ad.activo = False; ad.estado = "pausado"; db.commit(); db.refresh(ad); return ad
