"""
Un solo lugar para los números y reglas comerciales de ServiCuba.
"""

# ---------- Planes ----------
# GRATIS: consumidor/cliente. Puede descubrir y contratar servicios.
# BASE: profesional. Puede publicar servicios con un límite diario.
# PREMIUM: profesional con promoción, mayor alcance y límites ampliados.
PLAN_BASE_SERVICIOS_DIA = 1
PLAN_PREMIUM_SERVICIOS_DIA = 10

# ---------- Postulaciones ----------
PLAN_GRATIS_POSTULACIONES_SEMANA = 5   # límite heredado para profesionales sin Premium

# ---------- Descubrimiento ----------
PLAN_GRATIS_RADIO_MAX_KM = 3.0
PLAN_PREMIUM_RADIO_MAX_KM = 50.0

# ---------- Suscripción Premium ----------
PRECIO_SUSCRIPCION_PREMIUM = 5.0
SUSCRIPCION_PREMIUM_DIAS = 30
MONEDA_DEFECTO = "USD"

# ---------- Prioridad ----------
PUSH_PRIORIDAD_PREMIUM_MINUTOS = 15

# ---------- Destacados ----------
PRECIO_TAREA_DESTACADA = 2.0
TAREA_DESTACADA_DIAS = 7

# ---------- Anuncios Premium ----------
PRECIO_ANUNCIO_POR_DIA = 3.0
PLAN_PREMIUM_ANUNCIOS_DIA = 10


def is_premium_active(user) -> bool:
    """True sólo mientras la suscripción Premium esté vigente."""
    from datetime import datetime
    from ..models.user import UserPlan

    if user.plan != UserPlan.PREMIUM:
        return False
    if user.plan_expira is None:
        return False
    return datetime.utcnow() < user.plan_expira


def effective_plan(user) -> str:
    """Devuelve el plan comercial efectivo sin depender del modo activo."""
    from ..models.user import UserPlan

    if is_premium_active(user):
        return UserPlan.PREMIUM.value
    if user.es_trabajador:
        # Compatibilidad con cuentas antiguas: un trabajador que aún tenga
        # GRATIS se trata como BASE hasta que se actualice su columna.
        return UserPlan.BASE.value
    return UserPlan.GRATIS.value


def services_daily_limit(user) -> int:
    """Límite de publicaciones de servicios del profesional."""
    if is_premium_active(user):
        return PLAN_PREMIUM_SERVICIOS_DIA
    return PLAN_BASE_SERVICIOS_DIA
