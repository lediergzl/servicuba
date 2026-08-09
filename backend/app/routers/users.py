from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.category import Category
from ..schemas.user import UserResponse
from ..services.auth import get_current_user

router = APIRouter()

@router.get("/profile", response_model=UserResponse)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Antes esto devolvía current_user tal cual — sin la categoría, el
    # perfil del trabajador no mostraba ningún dato propio de su rol y se
    # veía idéntico al del cliente salvo por el texto "Trabajador"/
    # "Cliente". Se arma el dict a mano (en vez de dejar que FastAPI
    # serialice el modelo ORM directo) para no depender de cómo pydantic
    # coerciona los Enum de SQLAlchemy (rol, plan) a str.
    categoria_nombre = None
    categoria_icono = None
    if current_user.categoria_id:
        categoria = db.query(Category).filter(Category.id == current_user.categoria_id).first()
        if categoria:
            categoria_nombre = categoria.nombre
            categoria_icono = categoria.icono

    return {
        "id": current_user.id,
        "nombre": current_user.nombre,
        "telefono": current_user.telefono,
        "rol": current_user.rol.value,
        "rating": current_user.rating or 0.0,
        "verificado": current_user.verificado,
        "plan": current_user.plan.value,
        "plan_expira": current_user.plan_expira,
        "es_admin": current_user.es_admin,
        "created_at": current_user.created_at,
        "categoria_id": current_user.categoria_id,
        "categoria_nombre": categoria_nombre,
        "categoria_icono": categoria_icono,
    }

@router.put("/profile")
def update_profile():
    # Implementar actualización de perfil
    pass
