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


def _public_map_items(items: list[dict]) -> list[dict]:
    """Public map payload with deliberately coarse coordinates.

    Exact publication coordinates are never exposed to visitors. Two decimal
    places gives an approximate map position while preserving the privacy
    boundary used by the normal public discovery response.
    """
    safe = _public_items(items)
    for source, target in zip(items, safe):
        if source.get("lat") is not None and source.get("lng") is not None:
            target["lat"] = round(float(source["lat"]), 2)
            target["lng"] = round(float(source["lng"]), 2)
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


@router.get("/tasks/map")
def discover_tasks_map(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(5.0, ge=0.1, le=10),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Public map discovery with coarse task coordinates only."""
    items = find_nearby(db, lat, lng, min(radius_km, 10), tipo="necesidad", category_id=category_id)
    return _public_map_items(items)


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


@router.get("/offers/map")
def discover_offers_map(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(5.0, ge=0.1, le=10),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Public offer map discovery with coarse coordinates only."""
    items = find_nearby(db, lat, lng, min(radius_km, 10), tipo="oferta", category_id=category_id)
    return _public_map_items(items)
