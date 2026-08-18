from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from ..database import get_db
from ..models.user import User, UserPlan
from ..models.category import Category
from ..schemas.user import UserResponse, ActivarTrabajadorRequest, ModoActivoRequest
from ..services.auth import get_current_user, get_current_admin
from ..services.user_profile import build_user_response

router = APIRouter()

@router.get("/profile", response_model=UserResponse)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_user_response(db, current_user)


@router.put("/activar-trabajador", response_model=UserResponse)
def activar_trabajador(
    body: ActivarTrabajadorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Activa o actualiza el perfil profesional del usuario.

    Activar el perfil de trabajador convierte automáticamente una cuenta
    consumidora GRATIS en BASE. Así el modelo comercial queda claro:
    GRATIS = buscar/contratar; BASE = publicar servicios; PREMIUM =
    publicar y promocionar con beneficios ampliados.
    """
    categoria = db.query(Category).filter(Category.id == body.categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=400, detail="Categoría inválida")

    current_user.es_trabajador = True
    current_user.categoria_id = body.categoria_id
    current_user.descripcion_trabajador = body.descripcion_trabajador
    current_user.precio_hora = body.precio_hora
    if body.municipio is not None:
        current_user.municipio = body.municipio
    if body.zona is not None:
        current_user.zona = body.zona
    if body.lat is not None:
        current_user.lat = body.lat
    if body.lng is not None:
        current_user.lng = body.lng

    # Compatibilidad: cuentas antiguas con plan GRATIS que pasan a ser
    # profesionales reciben BASE sin tocar una suscripción Premium vigente.
    if current_user.plan == UserPlan.GRATIS:
        current_user.plan = UserPlan.BASE

    db.commit()
    db.refresh(current_user)
    return build_user_response(db, current_user)


@router.put("/modo-activo", response_model=UserResponse)
def cambiar_modo_activo(
    body: ModoActivoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Guarda qué panel (cliente/trabajador) vio el usuario por última vez."""
    if body.modo not in ("cliente", "trabajador"):
        raise HTTPException(status_code=400, detail="Modo inválido: debe ser 'cliente' o 'trabajador'")
    if body.modo == "cliente" and not current_user.es_cliente:
        raise HTTPException(status_code=403, detail="No tienes el perfil de cliente activo")
    if body.modo == "trabajador" and not current_user.es_trabajador:
        raise HTTPException(
            status_code=403,
            detail="Completa tu perfil de trabajador antes de activar este modo",
        )

    current_user.modo_activo = body.modo
    db.commit()
    db.refresh(current_user)
    return build_user_response(db, current_user)


# ---------- Estadísticas públicas ----------
@router.get("/stats/workers-count")
def workers_count(db: Session = Depends(get_db)):
    total = db.query(User).filter(User.es_trabajador == True).count()  # noqa: E712
    rows = (
        db.query(User.categoria_id, func.count(User.id))
        .filter(User.es_trabajador == True, User.categoria_id.isnot(None))  # noqa: E712
        .group_by(User.categoria_id)
        .all()
    )
    return {
        "total": total,
        "por_categoria": {str(cat_id): count for cat_id, count in rows},
    }


# ---------- Administración ----------
@router.get("/admin/list")
def list_users_admin(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter((User.nombre.ilike(like)) | (User.telefono.ilike(like)))
    users = query.order_by(User.created_at.desc()).limit(200).all()
    return [
        {
            "id": str(u.id),
            "nombre": u.nombre,
            "telefono": u.telefono,
            "es_cliente": u.es_cliente,
            "es_trabajador": u.es_trabajador,
            "es_admin": u.es_admin,
            "verificado": u.verificado,
            "plan": u.plan.value,
            "rating": u.rating or 0.0,
            "categoria_id": u.categoria_id,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/admin/{user_id}/toggle-verificado")
def toggle_verificado_admin(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.verificado = not user.verificado
    db.commit()
    return {"id": str(user.id), "verificado": user.verificado}
