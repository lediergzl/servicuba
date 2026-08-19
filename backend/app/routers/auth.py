from datetime import datetime, timedelta
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models.user import User
from ..schemas.user import UserCreate, UserLogin, Token, UserResponse
from ..services.auth import get_current_user
from ..services.user_profile import build_user_response
from ..utils.security import verify_password, get_password_hash, create_access_token

router = APIRouter()
settings = get_settings()

# A valid bcrypt hash used only to keep unknown-phone login work comparable to
# known-phone login. It is never accepted as a real user password.
_DUMMY_PASSWORD_HASH = "$2b$12$5uB0rR0vLaqEVZUIny0I3er1QvPaM230ykw19FtVIKuwXKoPjnSnC"
_LOGIN_FAILURE_LIMIT = 5
_LOGIN_LOCK_MINUTES = 15


def normalize_phone(value: str) -> str:
    return re.sub(r"[\s().-]", "", value or "")


def normalized_phone_column():
    """SQL expression compatible with PostgreSQL/MySQL for legacy phone rows."""
    value = User.telefono
    for char in (" ", ".", "-", "(", ")"):
        value = func.replace(value, char, "")
    return value


def _login_failure(user: User | None, db: Session) -> None:
    if user is None:
        return
    user.login_failed_attempts = (user.login_failed_attempts or 0) + 1
    user.login_last_failed_at = datetime.utcnow()
    if user.login_failed_attempts >= _LOGIN_FAILURE_LIMIT:
        user.login_locked_until = datetime.utcnow() + timedelta(minutes=_LOGIN_LOCK_MINUTES)
    db.commit()


def _clear_login_failures(user: User, db: Session) -> None:
    if user.login_failed_attempts or user.login_locked_until or user.login_last_failed_at:
        user.login_failed_attempts = 0
        user.login_locked_until = None
        user.login_last_failed_at = None
        db.commit()


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

    db_user = db.query(User).filter(User.telefono == telefono).first()
    if not db_user:
        db_user = db.query(User).filter(normalized_phone_column() == telefono).first()

    # Always perform a bcrypt verification, even for an unknown phone, to make
    # phone enumeration through response timing materially harder.
    password_ok = verify_password(
        user.password,
        db_user.password_hash if db_user else _DUMMY_PASSWORD_HASH,
    )

    now = datetime.utcnow()
    if db_user and db_user.login_locked_until and db_user.login_locked_until > now:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    if not db_user or not password_ok:
        _login_failure(db_user, db)
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    if db_user.suspendido:
        raise HTTPException(status_code=403, detail="Cuenta no disponible")

    _clear_login_failures(db_user, db)
    access_token = create_access_token(
        data={"sub": str(db_user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Devuelve el usuario autenticado para restaurar la sesión del frontend."""
    return build_user_response(db, current_user)
