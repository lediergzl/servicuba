from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models.user import User
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
    """Activa (o actualiza, si ya estaba activo) el perfil de trabajador
    del usuario — requerido antes de poder cambiar al modo Trabajador
    (PUT /modo-activo), postularse a tareas o publicar ofertas."""
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

    db.commit()
    db.refresh(current_user)
    return build_user_response(db, current_user)


@router.put("/modo-activo", response_model=UserResponse)
def cambiar_modo_activo(
    body: ModoActivoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Guarda qué panel (cliente/trabajador) vio el usuario por última vez.
    Se persiste en el SERVIDOR (no sólo en localStorage) para que la app
    recuerde el modo elegido entre dispositivos y sesiones."""
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


# ---------- Administración ----------
# Antes no existía NINGUNA pantalla para ver/gestionar usuarios en el
# panel de admin (sólo pagos/anuncios/categorías). Se agrega un listado
# simple con búsqueda + verificación manual — útil mientras no exista una
# pasarela de SMS real (ver routers/verification.py), un admin puede
# confirmar la identidad de alguien por otro medio (ej. llamada, WhatsApp)
# y marcarlo verificado a mano.

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
