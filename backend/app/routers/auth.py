from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..schemas.user import UserCreate, UserLogin, Token, UserResponse
from ..utils.security import verify_password, get_password_hash, create_access_token
from ..services.user_profile import build_user_response
from datetime import timedelta
from ..config import get_settings
import re

router = APIRouter()
settings = get_settings()


def normalize_phone(value: str) -> str:
    return re.sub(r"[\s().-]", "", value or "")


def normalized_phone_column():
    """SQL expression compatible with PostgreSQL/MySQL for legacy phone rows."""
    value = User.telefono
    for char in (" ", ".", "-", "(", ")"):
        value = func.replace(value, char, "")
    return value


@router.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    telefono = normalize_phone(user.telefono)
    existing = db.query(User).filter(normalized_phone_column() == telefono).first()
    if existing:
        raise HTTPException(status_code=400, detail="Teléfono ya registrado")

    es_trabajador = bool(user.es_trabajador and user.categoria_id)
    hashed = get_password_hash(user.password)
    db_user = User(
        nombre=user.nombre,
        telefono=telefono,
        password_hash=hashed,
        es_cliente=True,
        es_trabajador=es_trabajador,
        categoria_id=user.categoria_id if es_trabajador else None,
        descripcion_trabajador=user.descripcion_trabajador if es_trabajador else None,
        precio_hora=user.precio_hora if es_trabajador else None,
        lat=user.lat,
        lng=user.lng,
        municipio=user.municipio,
        zona=user.zona,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return build_user_response(db, db_user)


@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    telefono = normalize_phone(user.telefono)

    # Primero intentamos el formato canónico. Si la cuenta fue creada antes
    # de centralizar la normalización, buscamos también la versión limpia de
    # la columna para evitar un 401 falso por espacios/guiones/paréntesis.
    db_user = db.query(User).filter(User.telefono == telefono).first()
    if not db_user:
        db_user = db.query(User).filter(normalized_phone_column() == telefono).first()

    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    access_token = create_access_token(
        data={"sub": str(db_user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}
