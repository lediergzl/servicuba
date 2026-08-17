from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.nearby import find_nearby

router = APIRouter()


@router.get("/tasks")
def discover_tasks(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(3.0, ge=0.1, le=10),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Public discovery: lets visitors explore nearby needs before signup.

    It intentionally uses the free discovery radius cap and never exposes
    private task/application data. Contacting/applying still requires login.
    """
    return find_nearby(db, lat, lng, min(radius_km, 10), tipo="necesidad", category_id=category_id)


@router.get("/offers")
def discover_offers(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(3.0, ge=0.1, le=10),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Public discovery of worker offers before signup."""
    return find_nearby(db, lat, lng, min(radius_km, 10), tipo="oferta", category_id=category_id)
