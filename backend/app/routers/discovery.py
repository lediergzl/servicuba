from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.nearby import find_nearby

router = APIRouter()


def _public_items(items: list[dict]) -> list[dict]:
    """Remove identifiers and exact coordinates from unauthenticated results."""
    safe = []
    for item in items:
        safe.append({
            "id": item["id"],
            "titulo": item["titulo"],
            "descripcion": item.get("descripcion"),
            "precio": item.get("precio"),
            "distancia_km": item.get("distancia_km"),
            "categoria_id": item.get("categoria_id"),
            "estado": item.get("estado"),
            "tipo": item.get("tipo"),
            "destacada": item.get("destacada", False),
            "created_at": item.get("created_at"),
            **({"disponible_ahora": item["disponible_ahora"]} if "disponible_ahora" in item else {}),
        })
    return safe


@router.get("/tasks")
def discover_tasks(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(3.0, ge=0.1, le=10),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    items = find_nearby(db, lat, lng, min(radius_km, 10), tipo="necesidad", category_id=category_id)
    return _public_items(items)


@router.get("/offers")
def discover_offers(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(3.0, ge=0.1, le=10),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    items = find_nearby(db, lat, lng, min(radius_km, 10), tipo="oferta", category_id=category_id)
    return _public_items(items)
