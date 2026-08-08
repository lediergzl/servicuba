"""
Un solo lugar para los números del negocio. Cambiarlos aquí no requiere
tocar los routers.
"""

# ---------- Plan de trabajador ----------
PLAN_GRATIS_POSTULACIONES_SEMANA = 3   # None = ilimitado
PLAN_GRATIS_RADIO_MAX_KM = 3.0
PLAN_PREMIUM_RADIO_MAX_KM = 50.0

PRECIO_SUSCRIPCION_PREMIUM = 5.0       # por ciclo
SUSCRIPCION_PREMIUM_DIAS = 30
MONEDA_DEFECTO = "USD"

# ---------- Tareas destacadas ----------
PRECIO_TAREA_DESTACADA = 2.0
TAREA_DESTACADA_DIAS = 7

# ---------- Anuncios de marca ----------
PRECIO_ANUNCIO_POR_DIA = 3.0


def is_premium_active(user) -> bool:
    """Un usuario cuenta como premium sólo si el plan no venció — evita que
    una suscripción vencida siga dando beneficios indefinidamente."""
    from datetime import datetime
    from ..models.user import UserPlan

    if user.plan != UserPlan.PREMIUM:
        return False
    if user.plan_expira is None:
        return False
    return datetime.utcnow() < user.plan_expira
