from datetime import datetime, timedelta
import logging
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models.user import User
from ..schemas.user import UserCreate, UserLogin, Token, UserResponse
from ..services.auth import get_current_user
from ..services.email import send_email
from ..services.user_profile import build_user_response
from ..utils.security import verify_password, get_password_hash, create_access_token

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)
CODE_TTL_MINUTES = 10

_DUMMY_PASSWORD_HASH = "$2b$12$5uB0rR0vLaqEVZUIny0I3er1QvPaM230ykw19FtVIKuwXKoPjnSnC"
_LOGIN_FAILURE_LIMIT = 5
_LOGIN_LOCK_MINUTES = 15


class EmailVerificationRequest(BaseModel):
    email: str
    codigo: str


class ResendVerificationRequest(BaseModel):
    email: str


def normalize_phone(value: str) -> str:
    return re.sub(r"[\s().-]", "", value or "")


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def normalized_phone_column():
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


def _new_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _send_verification_email(user: User, codigo: str) -> None:
    send_email(
        user.email,
        "Código de verificación — ServiCuba",
        f"Hola {user.nombre},\n\nTu código de verificación de ServiCuba es: {codigo}\n\nEste código vence en {CODE_TTL_MINUTES} minutos.\n\nSi no creaste esta cuenta, ignora este mensaje.\n\nServiCuba",
    )


@router.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    telefono = normalize_phone(user.telefono)
    email = normalize_email(user.email)
    existing = db.query(User).filter(normalized_phone_column() == telefono).first()
    if existing:
        raise HTTPException(status_code=400, detail="Teléfono ya registrado")
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Correo electrónico ya registrado")

    es_trabajador = bool(user.es_trabajador and user.categoria_id)
    codigo = _new_verification_code()
    db_user = User(
        nombre=user.nombre,
        telefono=telefono,
        email=email,
        password_hash=get_password_hash(user.password),
        es_cliente=True,
        es_trabajador=es_trabajador,
        categoria_id=user.categoria_id if es_trabajador else None,
        descripcion_trabajador=user.descripcion_trabajador if es_trabajador else None,
        precio_hora=user.precio_hora if es_trabajador else None,
        lat=user.lat,
        lng=user.lng,
        municipio=user.municipio,
        zona=user.zona,
        verificado=False,
        codigo_verificacion=get_password_hash(codigo),
        codigo_verificacion_expira=datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES),
    )
    db.add(db_user)
    db.flush()
    try:
        _send_verification_email(db_user, codigo)
    except Exception:
        db.rollback()
        logger.exception("Registration verification email failed for domain=%s", email.rsplit("@", 1)[-1])
        raise HTTPException(status_code=503, detail="No se pudo enviar el correo de verificación. Revisa la configuración del servicio de correo e intenta nuevamente.")
    db.commit()
    db.refresh(db_user)
    return build_user_response(db, db_user)


@router.post("/verify-email")
def verify_email(payload: EmailVerificationRequest, db: Session = Depends(get_db)):
    """Verify a newly registered account using the 6-digit code sent by email."""
    email = normalize_email(payload.email)
    codigo = (payload.codigo or "").strip()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Código o correo incorrecto")
    if user.verificado:
        return {"message": "Esta cuenta ya está verificada", "verified": True}
    if not user.codigo_verificacion or not user.codigo_verificacion_expira:
        raise HTTPException(status_code=400, detail="No hay un código de verificación activo. Solicita uno nuevo.")
    if user.codigo_verificacion_expira < datetime.utcnow():
        raise HTTPException(status_code=400, detail="El código expiró. Solicita uno nuevo.")
    if not verify_password(codigo, user.codigo_verificacion):
        raise HTTPException(status_code=400, detail="Código incorrecto")

    user.verificado = True
    user.codigo_verificacion = None
    user.codigo_verificacion_expira = None
    db.commit()
    return {"message": "Correo verificado correctamente", "verified": True}


@router.post("/resend-verification")
def resend_verification(payload: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Generate and send a new email verification code for an unverified account."""
    email = normalize_email(payload.email)
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        # Do not disclose whether an account exists.
        return {"message": "Si existe una cuenta pendiente, enviamos un nuevo código.", "expira_en_minutos": CODE_TTL_MINUTES}
    if user.verificado:
        return {"message": "La cuenta ya está verificada.", "verified": True}

    codigo = _new_verification_code()
    user.codigo_verificacion = get_password_hash(codigo)
    user.codigo_verificacion_expira = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
    try:
        _send_verification_email(user, codigo)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Verification resend failed for domain=%s", email.rsplit("@", 1)[-1])
        raise HTTPException(status_code=503, detail="No se pudo enviar el correo de verificación. Intenta nuevamente.")
    return {"message": "Enviamos un nuevo código a tu correo.", "expira_en_minutos": CODE_TTL_MINUTES}


@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    telefono = normalize_phone(user.telefono)
    db_user = db.query(User).filter(User.telefono == telefono).first()
    if not db_user:
        db_user = db.query(User).filter(normalized_phone_column() == telefono).first()

    password_ok = verify_password(user.password, db_user.password_hash if db_user else _DUMMY_PASSWORD_HASH)
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
    return build_user_response(db, current_user)
