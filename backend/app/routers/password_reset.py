import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.password_reset import PasswordResetRequest, PasswordResetConfirm
from ..utils.security import get_password_hash, verify_password

router = APIRouter()

CODE_TTL_MINUTES = 10


@router.post("/forgot-password")
def request_password_reset(
    body: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    """Start password recovery without account enumeration.

    The one-time code is stored only as a bcrypt hash and is never returned
    by the API. A real SMS/WhatsApp delivery provider must deliver the code.
    """
    user = db.query(User).filter(User.telefono == body.telefono.strip()).first()

    if user:
        codigo = f"{secrets.randbelow(1_000_000):06d}"
        user.codigo_reset_password = get_password_hash(codigo)
        user.codigo_reset_password_expira = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
        db.commit()
        # TODO: dispatch `codigo` through the configured SMS/WhatsApp provider.
        # Never include it in the HTTP response or logs.

    return {
        "message": "Si el teléfono está registrado, recibirás un código de recuperación.",
        "expira_en_minutos": CODE_TTL_MINUTES,
    }


@router.post("/reset-password")
def confirm_password_reset(
    body: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.telefono == body.telefono.strip()).first()
    if not user or not user.codigo_reset_password or not user.codigo_reset_password_expira:
        raise HTTPException(status_code=400, detail="Código de recuperación inválido o expirado")
    if datetime.utcnow() > user.codigo_reset_password_expira:
        raise HTTPException(status_code=400, detail="El código expiró, solicita uno nuevo")
    if not verify_password(body.codigo, user.codigo_reset_password):
        raise HTTPException(status_code=400, detail="Código de recuperación inválido o expirado")
    if len(body.nueva_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    user.password_hash = get_password_hash(body.nueva_password)
    user.codigo_reset_password = None
    user.codigo_reset_password_expira = None
    db.commit()
    return {"message": "Contraseña actualizada correctamente"}
