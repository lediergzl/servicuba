"""Un solo lugar para armar la respuesta de perfil de usuario."""
from sqlalchemy.orm import Session
from ..models.user import User
from ..models.category import Category
from .plans import effective_plan, services_daily_limit, PLAN_GRATIS_POSTULACIONES_SEMANA, PLAN_GRATIS_RADIO_MAX_KM, PLAN_PREMIUM_RADIO_MAX_KM, PLAN_PREMIUM_ANUNCIOS_DIA


def build_user_response(db: Session, user: User) -> dict:
    categoria_nombre = None
    categoria_icono = None
    if user.categoria_id:
        categoria = db.query(Category).filter(Category.id == user.categoria_id).first()
        if categoria:
            categoria_nombre = categoria.nombre
            categoria_icono = categoria.icono

    plan = effective_plan(user)
    premium = plan == "premium"
    return {
        "id": user.id,
        "nombre": user.nombre,
        "telefono": user.telefono,
        "email": user.email,
        "rating": user.rating or 0.0,
        "verificado": user.verificado,
        "plan": plan,
        "plan_expira": user.plan_expira,
        "es_admin": user.es_admin,
        "created_at": user.created_at,
        "es_cliente": user.es_cliente,
        "es_trabajador": user.es_trabajador,
        "modo_activo": user.modo_activo,
        "categoria_id": user.categoria_id,
        "categoria_nombre": categoria_nombre,
        "categoria_icono": categoria_icono,
        "foto": user.foto,
        "descripcion_trabajador": user.descripcion_trabajador,
        "precio_hora": user.precio_hora,
        "municipio": user.municipio,
        "zona": user.zona,
        "entitlements": {
            "puede_contratar": bool(user.es_cliente),
            "puede_publicar_servicios": bool(user.es_trabajador),
            "servicios_por_dia": services_daily_limit(user) if user.es_trabajador else 0,
            "postulaciones_por_semana": None if premium else PLAN_GRATIS_POSTULACIONES_SEMANA,
            "radio_max_km": PLAN_PREMIUM_RADIO_MAX_KM if premium else PLAN_GRATIS_RADIO_MAX_KM,
            "puede_publicar_anuncios": premium,
            "anuncios_por_dia": PLAN_PREMIUM_ANUNCIOS_DIA if premium else 0,
            "puede_destacar_tareas": bool(user.es_cliente),
        },
    }
