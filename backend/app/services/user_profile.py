"""Un solo lugar para armar la respuesta de perfil de usuario (categoría
resuelta + campos de dualidad de roles) — la usan tanto POST /auth/register
como GET /users/profile y los endpoints que activan/cambian de rol, para no
mantener la misma lógica duplicada en varios archivos."""
from sqlalchemy.orm import Session
from ..models.user import User
from ..models.category import Category


def build_user_response(db: Session, user: User) -> dict:
    categoria_nombre = None
    categoria_icono = None
    if user.categoria_id:
        categoria = db.query(Category).filter(Category.id == user.categoria_id).first()
        if categoria:
            categoria_nombre = categoria.nombre
            categoria_icono = categoria.icono

    return {
        "id": user.id,
        "nombre": user.nombre,
        "telefono": user.telefono,
        "rating": user.rating or 0.0,
        "verificado": user.verificado,
        "plan": user.plan.value,
        "plan_expira": user.plan_expira,
        "es_admin": user.es_admin,
        "created_at": user.created_at,
        # Dualidad de roles — reemplaza al antiguo campo único `rol`.
        "es_cliente": user.es_cliente,
        "es_trabajador": user.es_trabajador,
        "modo_activo": user.modo_activo,
        # Perfil de trabajador (sólo tiene sentido si es_trabajador=True,
        # pero se devuelve siempre para que el frontend pueda mostrar un
        # formulario de activación pre-rellenado si el usuario ya cargó
        # algo antes).
        "categoria_id": user.categoria_id,
        "categoria_nombre": categoria_nombre,
        "categoria_icono": categoria_icono,
        "descripcion_trabajador": user.descripcion_trabajador,
        "precio_hora": user.precio_hora,
        "municipio": user.municipio,
        "zona": user.zona,
    }
