"""
Un solo lugar para los números del negocio. Cambiarlos aquí no requiere
tocar los routers.
"""

# ---------- Plan de trabajador ----------
# Antes: 3. Se sube a 5 (checklist "Plan ServiCuba Pro": postulaciones
# ilimitadas "vs. 5 gratis") — el límite gratis y el beneficio premium
# (ilimitado, ver is_premium_active() más abajo y su uso en
# routers/applications.py) ya existían por separado; sólo cambia el
# número del plan gratis.
PLAN_GRATIS_POSTULACIONES_SEMANA = 5   # None = ilimitado
PLAN_GRATIS_RADIO_MAX_KM = 3.0
PLAN_PREMIUM_RADIO_MAX_KM = 50.0

PRECIO_SUSCRIPCION_PREMIUM = 5.0       # por ciclo
SUSCRIPCION_PREMIUM_DIAS = 30
MONEDA_DEFECTO = "USD"

# Prioridad en notificaciones push (checklist "Plan ServiCuba Pro"): al
# publicarse una tarea nueva, los trabajadores Premium de esa categoría
# se avisan al instante; los del plan gratis, este número de minutos
# después — ver services/notificaciones.py. Le da al plan Pro una
# ventana real de ventaja para postularse antes que nadie.
PUSH_PRIORIDAD_PREMIUM_MINUTOS = 15

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
