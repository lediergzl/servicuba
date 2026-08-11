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
from ..models.user import User, UserPlan


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

    # Pin dorado automático del plan "ServiCuba Pro": un publicador con
    # Premium activo (misma condición que is_premium_active() en
    # services/plans.py, reescrita en SQL porque acá se evalúa por fila
    # contra la tabla, no contra un único objeto User ya cargado) se
    # trata como "destacado" en el listado/mapa SIN necesidad de pagar
    # por destacar esa publicación puntual — se prende/apaga solo según
    # el estado del plan, a diferencia de Task.destacada_hasta (que es
    # un pago con fecha de vencimiento fija).
    publicador_premium = (
        (User.plan == UserPlan.PREMIUM)
        & (User.plan_expira.isnot(None))
        & (User.plan_expira > now)
    )

    query = (
        db.query(
            Task,
            ST_Distance(geo_task, geo_point).label("distance"),
            ST_Y(Task.ubicacion).label("task_lat"),
            ST_X(Task.ubicacion).label("task_lng"),
            publicador_premium.label("publicador_premium"),
        )
        .join(User, User.id == Task.cliente_id)
        .filter(
            Task.estado == TaskStatus.ACTIVA,
            Task.tipo == tipo,
            ST_DWithin(geo_task, geo_point, radius_m),
        )
    )
    if category_id:
        query = query.filter(Task.categoria_id == category_id)

    destacada_pagada = (Task.destacada == True) & (Task.destacada_hasta > now)  # noqa: E712
    # El orden de "quién va primero" combina AMBOS motivos de destaque
    # (pagado u otorgado por el plan) — para el usuario que busca da lo
    # mismo por qué está destacada, sólo importa que aparezca arriba.
    boost_activo = destacada_pagada | publicador_premium
    results = query.order_by(boost_activo.desc(), "distance").limit(limit).all()

    items = []
    for task, dist, task_lat, task_lng, premium in results:
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
            "destacada": bool(
                (task.destacada and task.destacada_hasta and task.destacada_hasta > now)
                or premium
            ),
            "created_at": task.created_at,
            "lat": task_lat,
            "lng": task_lng,
        })
    return items
