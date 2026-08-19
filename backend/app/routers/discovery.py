from typing import Optional
import re
from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..models.category import Category
from ..services.nearby import find_nearby

router = APIRouter()


def _public_items(items: list[dict]) -> list[dict]:
    safe = []
    for item in items:
        safe.append({"id": item["id"], "titulo": item["titulo"], "descripcion": item.get("descripcion"), "precio": item.get("precio"), "distancia_km": item.get("distancia_km"), "categoria_id": item.get("categoria_id"), "estado": item.get("estado"), "tipo": item.get("tipo"), "destacada": item.get("destacada", False), "created_at": item.get("created_at"), **({"disponible_ahora": item["disponible_ahora"]} if "disponible_ahora" in item else {})})
    return safe


def _public_map_items(items: list[dict]) -> list[dict]:
    safe = _public_items(items)
    for source, target in zip(items, safe):
        if source.get("lat") is not None and source.get("lng") is not None:
            target["lat"] = round(float(source["lat"]), 2)
            target["lng"] = round(float(source["lng"]), 2)
    return safe


def _valid_coordinates(lat: Optional[float], lng: Optional[float]) -> bool:
    return lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180


def _slug(value: str) -> str:
    value = value.lower().strip()
    value = value.replace("ñ", "n")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


@router.get("/tasks")
def discover_tasks(lat: Optional[float] = Query(None), lng: Optional[float] = Query(None), radius_km: float = Query(3.0, ge=0.1, le=10), category_id: Optional[int] = None, db: Session = Depends(get_db)):
    if not _valid_coordinates(lat, lng):
        return []
    return _public_items(find_nearby(db, lat, lng, min(radius_km, 10), tipo="necesidad", category_id=category_id))


@router.get("/tasks/map")
def discover_tasks_map(lat: Optional[float] = Query(None), lng: Optional[float] = Query(None), radius_km: float = Query(5.0, ge=0.1, le=10), category_id: Optional[int] = None, db: Session = Depends(get_db)):
    if not _valid_coordinates(lat, lng):
        return []
    return _public_map_items(find_nearby(db, lat, lng, min(radius_km, 10), tipo="necesidad", category_id=category_id))


@router.get("/offers")
def discover_offers(lat: Optional[float] = Query(None), lng: Optional[float] = Query(None), radius_km: float = Query(3.0, ge=0.1, le=10), category_id: Optional[int] = None, db: Session = Depends(get_db)):
    if not _valid_coordinates(lat, lng):
        return []
    return _public_items(find_nearby(db, lat, lng, min(radius_km, 10), tipo="oferta", category_id=category_id))


@router.get("/offers/map")
def discover_offers_map(lat: Optional[float] = Query(None), lng: Optional[float] = Query(None), radius_km: float = Query(5.0, ge=0.1, le=10), category_id: Optional[int] = None, db: Session = Depends(get_db)):
    if not _valid_coordinates(lat, lng):
        return []
    return _public_map_items(find_nearby(db, lat, lng, min(radius_km, 10), tipo="oferta", category_id=category_id))


@router.get("/directory/municipios")
def directory_municipios(db: Session = Depends(get_db)):
    """Return municipalities from active publications, using the task's own location field."""
    rows = (
        db.query(Task.municipio)
        .filter(
            Task.estado == TaskStatus.ACTIVA,
            Task.municipio.isnot(None),
            func.length(func.trim(Task.municipio)) >= 2,
        )
        .distinct()
        .order_by(Task.municipio)
        .all()
    )
    return sorted({row[0].strip() for row in rows if row[0] and row[0].strip()}, key=str.casefold)


@router.get("/directory")
def discover_directory(municipio: Optional[str] = Query(None, max_length=100), tipo: str = Query("oferta", pattern="^(oferta|necesidad)$"), category_id: Optional[int] = None, db: Session = Depends(get_db)):
    if not municipio or len(municipio.strip()) < 2:
        return []
    clean_municipio = municipio.strip()
    query = (db.query(Task, Category.nombre.label("categoria_nombre")).join(User, User.id == Task.cliente_id).outerjoin(Category, Category.id == Task.categoria_id).filter(Task.estado == TaskStatus.ACTIVA, Task.tipo == tipo, func.lower(Task.municipio) == func.lower(clean_municipio)))
    if category_id:
        query = query.filter(Task.categoria_id == category_id)
    rows = query.order_by(Task.destacada.desc(), Task.created_at.desc()).limit(50).all()
    return [{"id": task.id, "titulo": task.titulo, "descripcion": task.descripcion, "precio": task.precio, "categoria_id": task.categoria_id, "categoria_nombre": categoria_nombre, "estado": task.estado.value, "tipo": task.tipo, "destacada": bool(task.destacada), "municipio": clean_municipio, "created_at": task.created_at} for task, categoria_nombre in rows]


@router.get("/recent-activity")
def recent_activity(limit: int = Query(6, ge=1, le=12), db: Session = Depends(get_db)):
    rows = (db.query(Task, Category.nombre.label("categoria_nombre"), Category.icono.label("categoria_icono")).outerjoin(Category, Category.id == Task.categoria_id).filter(Task.estado == TaskStatus.ACTIVA).order_by(Task.created_at.desc()).limit(limit).all())
    return [{"id": str(task.id), "titulo": task.titulo, "tipo": task.tipo, "categoria_nombre": categoria_nombre, "categoria_icono": categoria_icono, "municipio": task.municipio, "created_at": task.created_at.isoformat() if task.created_at else None} for task, categoria_nombre, categoria_icono in rows]


@router.get("/seo/servicios/{service_slug}/{city_slug}", response_class=HTMLResponse, include_in_schema=False)
def seo_service_page(service_slug: str, city_slug: str, db: Session = Depends(get_db)):
    """Crawlable public HTML for service + city searches; no JS/auth required."""
    category = next((c for c in db.query(Category).filter(Category.activo.is_(True)).all() if _slug(c.nombre) == service_slug.rstrip("s")), None)
    city_name = city_slug.replace("-", " ").title()
    if city_slug == "la-habana": city_name = "La Habana"
    if city_slug == "santiago-de-cuba": city_name = "Santiago de Cuba"
    service_name = category.nombre if category else service_slug.replace("-", " ").title()
    count = 0
    if category:
        count = db.query(Task).join(User, User.id == Task.cliente_id).filter(Task.estado == TaskStatus.ACTIVA, Task.tipo == "oferta", Task.categoria_id == category.id, func.lower(User.municipio) == func.lower(city_name)).count()
    title = f"{service_name} en {city_name} | ServiCuba"
    description = f"Encuentra servicios de {service_name.lower()} en {city_name}. ServiCuba conecta personas con trabajadores locales."
    return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><meta name="description" content="{description}"><link rel="canonical" href="https://servicuba.onrender.com/servicios/{service_slug}/{city_slug}"><meta property="og:title" content="{title}"><meta property="og:description" content="{description}"></head><body><main><h1>{service_name} en {city_name}</h1><p>{description}</p><p>Hay actualmente {count} publicación(es) activa(s) de este servicio en este municipio.</p><p>Busca trabajadores, compara opciones y contacta directamente a quien pueda ayudarte.</p><p><a href="/">Volver a ServiCuba</a></p></main></body></html>'''
