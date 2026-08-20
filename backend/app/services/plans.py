"""Reglas comerciales centralizadas de ServiCuba."""
from datetime import datetime

PLAN_BASE_SERVICIOS_DIA = 1
PLAN_PREMIUM_SERVICIOS_DIA = 10
PLAN_GRATIS_POSTULACIONES_SEMANA = 5

# Cobertura comercial del profesional. FREE no publica; BASE tiene alcance
# estándar y PREMIUM alcance ampliado.
PLAN_BASE_RADIO_MAX_KM = 5.0
PLAN_PREMIUM_RADIO_MAX_KM = 20.0
# Compatibilidad con código existente que usa este nombre para usuarios no premium.
PLAN_GRATIS_RADIO_MAX_KM = PLAN_BASE_RADIO_MAX_KM

PRECIO_SUSCRIPCION_PREMIUM = 5.0
SUSCRIPCION_PREMIUM_DIAS = 30
MONEDA_DEFECTO = "USD"
PUSH_PRIORIDAD_PREMIUM_MINUTOS = 15
PRECIO_TAREA_DESTACADA = 2.0
TAREA_DESTACADA_DIAS = 7
PRECIO_ANUNCIO_POR_DIA = 3.0
PLAN_PREMIUM_ANUNCIOS_DIA = 10


def is_premium_active(user) -> bool:
    from ..models.user import UserPlan
    return bool(user.plan == UserPlan.PREMIUM and user.plan_expira and datetime.utcnow() < user.plan_expira)


def effective_plan(user) -> str:
    from ..models.user import UserPlan
    if is_premium_active(user):
        return UserPlan.PREMIUM.value
    # Una suscripción vencida deja de otorgar beneficios inmediatamente.
    if user.es_trabajador:
        return UserPlan.BASE.value
    return UserPlan.GRATIS.value


def services_daily_limit(user) -> int:
    if effective_plan(user) == "premium":
        return PLAN_PREMIUM_SERVICIOS_DIA
    if effective_plan(user) == "base":
        return PLAN_BASE_SERVICIOS_DIA
    return 0


def coverage_radius_km(user) -> float:
    return PLAN_PREMIUM_RADIO_MAX_KM if effective_plan(user) == "premium" else PLAN_BASE_RADIO_MAX_KM


def can_create_promotional_ads(user) -> bool:
    return effective_plan(user) == "premium"
