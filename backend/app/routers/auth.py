from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
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

    # Dualidad de roles (ver models/user.py): ya no se elige un `rol` fijo
    # al registrarse. Toda cuenta nace con es_cliente=True; es_trabajador
    # se activa opcionalmente desde el checkbox del registro (o después,
    # vía PUT /users/activar-trabajador). Si se marcó el checkbox pero no
    # se eligió categoría, no activamos el perfil a medias — se completa
    # después desde el perfil.
    es_trabajador = bool(user.es_trabajador and user.categoria_id)

    hashed = get_password_hash(user.password)
    db_user = User(
        nombre=user.nombre,
        telefono=user.telefono,
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
    # build_user_response() es el único lugar que arma la respuesta de
    # usuario (ya lo usan GET /users/profile, PUT /users/activar-trabajador
    # y PUT /users/modo-activo) y resuelve categoria_nombre/categoria_icono,
    # además de garantizar que todos los campos de UserResponse queden
    # poblados explícitamente.
    return build_user_response(db, db_user)

@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.telefono == user.telefono).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    # NOTA: el claim "rol" se quitó del token — `rol` es el campo
    # DEPRECADO de antes de la dualidad de roles (ver models/user.py) y
    # queda en None para toda cuenta creada con el flujo actual. Nada en
    # el backend lee ese claim (decode_token/get_current_user sólo usan
    # "sub"), así que incluirlo sólo reintroduciría el mismo
    # AttributeError que rompía el registro.
    access_token = create_access_token(
        data={"sub": str(db_user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}
