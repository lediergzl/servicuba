"""Lógica de búsqueda geográfica compartida entre GET /tasks/nearby
(trabajador busca necesidades publicadas por clientes) y
GET /tasks/ofertas/nearby (cliente busca ofertas de servicio publicadas
por trabajadores). Es la MISMA consulta PostGIS en ambos casos — sólo
cambia qué `tipo` de Task se filtra — así que vive en un solo lugar en
vez de duplicarse entre los dos routers."""
from datetime import datetime
from sqlalchemy import cast
from sqlalchemy.orm import Session
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_Distance, ST_SetSRID, ST_MakePoint, ST_X, ST_Y
from ..models.task import Task, TaskStatus


def find_nearby(
    db: Session,
    lat: float,
    lng: float,
    radius_km: float,
    tipo: str,
    category_id: int | None = None,
    limit: int = 50,
) -> list[dict]:
    radius_m = radius_km * 1000
    point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    # ubicacion es Geometry(SRID 4326): sin castear a geography, PostGIS
    # calcula ST_Distance/ST_DWithin en GRADOS, no en metros — ver la nota
    # histórica original en routers/tasks.py sobre este mismo bug.
    geo_task = cast(Task.ubicacion, Geography)
    geo_point = cast(point, Geography)
    now = datetime.utcnow()
    query = db.query(
        Task,
        ST_Distance(geo_task, geo_point).label("distance"),
        ST_Y(Task.ubicacion).label("task_lat"),
        ST_X(Task.ubicacion).label("task_lng"),
    ).filter(
        Task.estado == TaskStatus.ACTIVA,
        Task.tipo == tipo,
        ST_DWithin(geo_task, geo_point, radius_m),
    )
    if category_id:
        query = query.filter(Task.categoria_id == category_id)

    destacada_activa = (Task.destacada == True) & (Task.destacada_hasta > now)  # noqa: E712
    results = query.order_by(destacada_activa.desc(), "distance").limit(limit).all()

    items = []
    for task, dist, task_lat, task_lng in results:
        items.append({
            "id": task.id,
            "titulo": task.titulo,
            "descripcion": task.descripcion,
            "precio": task.precio,
            "distancia_km": round(dist / 1000, 2),
            "categoria_id": task.categoria_id,
            "estado": task.estado.value,
            "tipo": task.tipo,
            # cliente_id es quien PUBLICÓ (cliente si tipo='necesidad',
            # trabajador si tipo='oferta') — ver nota en models/task.py.
            "publicador_id": task.cliente_id,
            "destacada": bool(task.destacada and task.destacada_hasta and task.destacada_hasta > now),
            "created_at": task.created_at,
            "lat": task_lat,
            "lng": task_lng,
        })
    return items
