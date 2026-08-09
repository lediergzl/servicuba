from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models.category import Category
from ..models.user import User
from ..schemas.category import CategoryCreate, CategoryResponse
from ..services.auth import get_current_admin

router = APIRouter()

@router.get("")
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).filter(Category.activo == True).all()  # noqa: E712


# ---------- Administración ----------
# Antes no existía NINGÚN endpoint para crear categorías — sólo las 4
# sembradas al arrancar (ver main.py). Se agrega acá, con permisos de
# admin, igual que ads/payments.

@router.get("/all", response_model=list[CategoryResponse])
def list_all_categories(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Incluye inactivas — GET (pública) sólo devuelve las activas."""
    return db.query(Category).order_by(Category.id).all()


@router.post("", response_model=CategoryResponse)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    nombre = payload.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    existing = db.query(Category).filter(func.lower(Category.nombre) == nombre.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")

    # El id NO se deja en manos de un autoincrement de Postgres: las 4
    # categorías semilla (ver main.py) se insertan con id explícito
    # (1-4), lo que NO avanza la secuencia interna de la columna. Si acá
    # se dejara que Postgres generara el id solo, el primer INSERT
    # intentaría id=1 de nuevo y chocaría con la categoría existente.
    # Calcular max(id)+1 a mano evita depender de esa secuencia.
    next_id = (db.query(func.max(Category.id)).scalar() or 0) + 1

    categoria = Category(id=next_id, nombre=nombre, icono=payload.icono, activo=True)
    db.add(categoria)
    db.commit()
    db.refresh(categoria)
    return categoria


@router.post("/{category_id}/toggle", response_model=CategoryResponse)
def toggle_category(
    category_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    categoria = db.query(Category).filter(Category.id == category_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    categoria.activo = not categoria.activo
    db.commit()
    db.refresh(categoria)
    return categoria
