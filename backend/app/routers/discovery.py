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
from ..services.plans import is_premium_active

router = APIRouter()

def _public_items(items: list[dict]) -> list[dict]:
    return [{"id": item["id"], "titulo": item["titulo"], "descripcion": item.get("descripcion"), "precio": item.get("precio"), "distancia_km": item.get("distancia_km"), "categoria_id": item.get("categoria_id"), "estado": item.get("estado"), "tipo": item.get("tipo"), "destacada": item.get("destacada", False), "created_at": item.get("created_at"), **({"disponible_ahora": item["disponible_ahora"]} if "disponible_ahora" in item else {})} for item in items]
def _public_map_items(items: list[dict]) -> list[dict]:
    safe=_public_items(items)
    for source,target in zip(items,safe):
        if source.get("lat") is not None and source.get("lng") is not None: target["lat"]=round(float(source["lat"]),2); target["lng"]=round(float(source["lng"]),2)
    return safe
def _valid_coordinates(lat,lng): return lat is not None and lng is not None and -90<=lat<=90 and -180<=lng<=180
def _slug(value): return re.sub(r"[^a-z0-9]+","-",value.lower().strip().replace("ñ","n")).strip("-")

@router.get("/tasks")
def discover_tasks(lat:Optional[float]=Query(None),lng:Optional[float]=Query(None),radius_km:float=Query(3.0,ge=.1,le=10),category_id:Optional[int]=None,db:Session=Depends(get_db)):
    return [] if not _valid_coordinates(lat,lng) else _public_items(find_nearby(db,lat,lng,min(radius_km,10),tipo="necesidad",category_id=category_id))
@router.get("/tasks/map")
def discover_tasks_map(lat:Optional[float]=Query(None),lng:Optional[float]=Query(None),radius_km:float=Query(5.0,ge=.1,le=10),category_id:Optional[int]=None,db:Session=Depends(get_db)):
    return [] if not _valid_coordinates(lat,lng) else _public_map_items(find_nearby(db,lat,lng,min(radius_km,10),tipo="necesidad",category_id=category_id))
@router.get("/offers")
def discover_offers(lat:Optional[float]=Query(None),lng:Optional[float]=Query(None),radius_km:float=Query(3.0,ge=.1,le=10),category_id:Optional[int]=None,db:Session=Depends(get_db)):
    return [] if not _valid_coordinates(lat,lng) else _public_items(find_nearby(db,lat,lng,min(radius_km,10),tipo="oferta",category_id=category_id))
@router.get("/offers/map")
def discover_offers_map(lat:Optional[float]=Query(None),lng:Optional[float]=Query(None),radius_km:float=Query(5.0,ge=.1,le=10),category_id:Optional[int]=None,db:Session=Depends(get_db)):
    return [] if not _valid_coordinates(lat,lng) else _public_map_items(find_nearby(db,lat,lng,min(radius_km,10),tipo="oferta",category_id=category_id))
@router.get("/directory/municipios")
def directory_municipios(db:Session=Depends(get_db)):
    rows=db.query(User.municipio).filter(User.es_trabajador.is_(True),User.suspendido.is_(False),User.municipio.isnot(None),func.length(func.trim(User.municipio))>=2).distinct().all(); return sorted({r[0].strip() for r in rows if r[0] and r[0].strip()},key=str.casefold)
@router.get("/directory")
def discover_directory(municipio:Optional[str]=Query(None,max_length=100),tipo:str=Query("oferta",pattern="^(oferta|necesidad)$"),category_id:Optional[int]=None,db:Session=Depends(get_db)):
    if not municipio or len(municipio.strip())<2:return []
    q=db.query(User,Category.nombre.label("categoria_nombre"),Category.icono.label("categoria_icono")).outerjoin(Category,Category.id==User.categoria_id).filter(User.es_trabajador.is_(True),User.suspendido.is_(False),User.municipio.isnot(None),func.lower(func.trim(User.municipio))==func.lower(municipio.strip()))
    if category_id:q=q.filter(User.categoria_id==category_id)
    rows=q.order_by(User.verificado.desc(),User.rating.desc(),User.nombre.asc()).limit(100).all()
    data=[]
    for u,cat,icon in rows:
        premium=is_premium_active(u)
        data.append({"id":str(u.id),"nombre":u.nombre,"foto":u.foto,"categoria_id":u.categoria_id,"categoria_nombre":cat,"categoria_icono":icon,"descripcion_trabajador":u.descripcion_trabajador,"precio_hora":u.precio_hora,"rating":u.rating or 0,"verificado":bool(u.verificado),"premium":premium,"plan_badge":"⭐ PREMIUM" if premium else None,"municipio":u.municipio,"zona":u.zona,"lat":u.lat,"lng":u.lng})
    return sorted(data,key=lambda x:(not x["premium"],not x["verificado"],-x["rating"],x["nombre"].casefold()))
@router.get("/recent-activity")
def recent_activity(limit:int=Query(6,ge=1,le=12),db:Session=Depends(get_db)):
    rows=db.query(Task,Category.nombre.label("categoria_nombre"),Category.icono.label("categoria_icono")).outerjoin(Category,Category.id==Task.categoria_id).filter(Task.estado==TaskStatus.ACTIVA).order_by(Task.created_at.desc()).limit(limit).all();return [{"id":str(t.id),"titulo":t.titulo,"tipo":t.tipo,"categoria_nombre":c,"categoria_icono":i,"municipio":t.municipio,"created_at":t.created_at.isoformat() if t.created_at else None} for t,c,i in rows]
@router.get("/seo/servicios/{service_slug}/{city_slug}",response_class=HTMLResponse,include_in_schema=False)
def seo_service_page(service_slug:str,city_slug:str,db:Session=Depends(get_db)):
    category=next((c for c in db.query(Category).filter(Category.activo.is_(True)).all() if _slug(c.nombre)==service_slug.rstrip("s")),None);city_name=city_slug.replace("-"," ").title();city_name="La Habana" if city_slug=="la-habana" else ("Santiago de Cuba" if city_slug=="santiago-de-cuba" else city_name);service_name=category.nombre if category else service_slug.replace("-"," ").title();count=db.query(User).filter(User.es_trabajador.is_(True),User.suspendido.is_(False),User.categoria_id==category.id,func.lower(func.trim(User.municipio))==func.lower(city_name)).count() if category else 0;title=f"{service_name} en {city_name} | ServiCuba";description=f"Encuentra servicios de {service_name.lower()} en {city_name}. ServiCuba conecta personas con trabajadores locales.";return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><meta name="description" content="{description}"></head><body><main><h1>{service_name} en {city_name}</h1><p>{description}</p><p>Hay actualmente {count} trabajador(es) con perfil activo en este municipio.</p><p><a href="/">Volver a ServiCuba</a></p></main></body></html>'''
