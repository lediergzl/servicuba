import json
import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.ad import Ad
from ..models.payment import Payment, PaymentType, PaymentStatus
from ..schemas.ad import AdResponse
from ..services.auth import get_current_user, get_current_admin

router = APIRouter()


def _elegir_sin_repetir(candidatos: list[Ad], excluidos: set[str]) -> Ad | None:
    """Elige al azar entre los anuncios que TODAVÍA no se mostraron en
    este ciclo (según `excluidos`, ids que el frontend ya vio). Si ya se
    mostraron todos los candidatos disponibles, se reinicia el ciclo
    eligiendo entre todos de nuevo — así nunca se repite un anuncio
    mientras queden otros sin mostrar, pero tampoco se queda sin poder
    elegir cuando se agotan."""
    if not candidatos:
        return None
    no_vistos = [a for a in candidatos if str(a.id) not in excluidos]
    pool = no_vistos if no_vistos else candidatos
    return random.choice(pool)


@router.get("/active", response_model=AdResponse | None)
def get_active_ad(
    category_id: int | None = None,
    excluir: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve un anuncio activo para mostrar y cuenta la impresión."""
    now = datetime.utcnow()
    base_query = db.query(Ad).filter(
        Ad.activo == True,  # noqa: E712
        Ad.fecha_inicio <= now,
        Ad.fecha_fin >= now,
    )
    excluidos = {x.strip() for x in excluir.split(",")} if excluir else set()
    excluidos.discard("")

    ad = None
    if category_id is not None:
        segmentados = base_query.filter(Ad.categoria_id == category_id).all()
        ad = _elegir_sin_repetir(segmentados, excluidos)

    if ad is None:
        generales = base_query.filter(Ad.categoria_id.is_(None)).all()
        ad = _elegir_sin_repetir(generales, excluidos)

    if ad is None:
        return None

    ad.impresiones += 1
    db.commit()
    db.refresh(ad)
    return ad


@router.post("/{ad_id}/click")
def register_click(
    ad_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ad = db.query(Ad).filter(Ad.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    ad.clics += 1
    db.commit()
    return {"url_destino": ad.url_destino}


# ---------- Administración ----------

@router.get("/", response_model=list[AdResponse])
def list_ads(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    return db.query(Ad).order_by(Ad.created_at.desc()).all()


@router.post("/{ad_id}/toggle", response_model=AdResponse)
def toggle_ad(
    ad_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    ad = db.query(Ad).filter(Ad.id == ad_id).with_for_update().first()
    if not ad:
        raise HTTPException(status_code=404, detail="Anuncio no encontrado")

    if not ad.activo:
        # Un anuncio pagado entra INACTIVO y no consume su duración hasta
        # que moderación lo aprueba. La duración se recupera del pago que
        # originó el anuncio; no confiamos en datos enviados por el cliente.
        if not ad.payment_id:
            raise HTTPException(status_code=409, detail="El anuncio no tiene un pago asociado")
        payment = db.query(Payment).filter(Payment.id == ad.payment_id).first()
        if not payment or payment.tipo != PaymentType.ANUNCIO or payment.estado != PaymentStatus.CONFIRMADO:
            raise HTTPException(status_code=409, detail="El pago asociado al anuncio no está confirmado")
        try:
            detalle = json.loads(payment.notas) if payment.notas else {}
            dias = int(detalle.get("dias", 0))
        except (TypeError, ValueError, json.JSONDecodeError):
            raise HTTPException(status_code=409, detail="La duración del anuncio no es válida")
        if not 1 <= dias <= 90:
            raise HTTPException(status_code=409, detail="La duración del anuncio no es válida")
        now = datetime.utcnow()
        ad.fecha_inicio = now
        ad.fecha_fin = now + timedelta(days=dias)
        payment.entitlement_expires_at = ad.fecha_fin
        ad.activo = True
    else:
        ad.activo = False

    db.commit()
    db.refresh(ad)
    return ad