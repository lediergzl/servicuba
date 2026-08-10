from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User, UserRole
from ..schemas.user import UserCreate, UserLogin, Token, UserResponse
from ..utils.security import verify_password, get_password_hash, create_access_token
from ..services.user_profile import build_user_response
from datetime import timedelta
from ..config import get_settings

router = APIRouter()
settings = get_settings()

@router.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.telefono == user.telefono).first()
    if existing:
        raise HTTPException(status_code=400, detail="Teléfono ya registrado")
    try:
        rol = UserRole(user.rol)
    except ValueError:
        raise HTTPException(status_code=400, detail="Rol inválido: debe ser 'cliente' o 'trabajador'")
    hashed = get_password_hash(user.password)
    db_user = User(
        nombre=user.nombre,
        telefono=user.telefono,
        password_hash=hashed,
        rol=rol,
        categoria_id=user.categoria_id,
        lat=user.lat,
        lng=user.lng,
        municipio=user.municipio,
        zona=user.zona
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    # Antes: `return db_user` devolvía el objeto ORM crudo, que FastAPI
    # serializa leyendo atributos directamente. Para cuentas viejas (de
    # antes de la dualidad de roles) cuyo objeto no tuviera poblados
    # es_cliente/es_trabajador/modo_activo, eso rompía con
    # ResponseValidationError ("Field required"). build_user_response()
    # es el único lugar que arma la respuesta de usuario (ya lo usan
    # GET /users/profile, PUT /users/activar-trabajador y
    # PUT /users/modo-activo) y fuerza esos campos explícitamente, además
    # de resolver categoria_nombre/categoria_icono que acá siempre
    # quedaban en None.
    return build_user_response(db, db_user)

@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.telefono == user.telefono).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    access_token = create_access_token(
        data={"sub": str(db_user.id), "rol": db_user.rol.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}
