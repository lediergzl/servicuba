import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.ad import Ad
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
    """Devuelve un anuncio activo para mostrar (prioriza los segmentados a
    la categoría solicitada) y cuenta la impresión. current_user sólo se
    exige para evitar scraping anónimo del inventario de anuncios.

    `excluir`: ids (separados por coma) de anuncios que el frontend ya
    mostró en este ciclo de rotación — ver frontend/js/monetization.js.
    Se usa para no repetir uno hasta que hayan pasado todos los activos.
    """
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
    ad = db.query(Ad).filter(Ad.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    ad.activo = not ad.activo
    db.commit()
    db.refresh(ad)
    return ad
