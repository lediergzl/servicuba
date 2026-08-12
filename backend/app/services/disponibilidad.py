"""
Calendario de disponibilidad del trabajador — beneficio Premium
("disponible ahora" en el listado de ofertas cercanas, ver
services/nearby.py).

TODO: todavía no existe un modelo de calendario (franjas horarias) para
esta funcionalidad. Por ahora esto es un STUB que no marca a nadie como
disponible, solo para que el import en nearby.py no rompa el arranque
del backend (ver ModuleNotFoundError en el deploy). Cuando se construya
el modelo real (tabla de horarios + endpoint para que el trabajador
configure su disponibilidad), esta función debe reemplazarse por la
lógica real que consulte esa tabla contra la hora actual.
"""
from uuid import UUID
from sqlalchemy.orm import Session


def calcular_disponibles_ahora(db: Session, worker_ids: set[UUID]) -> set[UUID]:
    """Devuelve el subconjunto de worker_ids que están disponibles ahora
    mismo, según su calendario configurado.

    Stub: siempre devuelve un set vacío (nadie aparece como "disponible
    ahora") hasta que exista el modelo de calendario real. No lanza
    excepciones ni depende de tablas que no existen todavía, así que es
    seguro dejarlo desplegado mientras se construye la funcionalidad
    completa.
    """
    return set()
