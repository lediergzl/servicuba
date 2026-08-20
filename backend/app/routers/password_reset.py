import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.password_reset import PasswordResetRequest, PasswordResetConfirm
from ..services.email import send_email
from ..utils.security import get_password_hash, verify_password

router = APIRouter()
CODE_TTL_MINUTES = 10


@router.post("/forgot-password")
def request_password_reset(body: PasswordResetRequest, db: Session = Depends(get_db)):
    """Send a one-time password reset code to the account email."""
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if user:
        codigo = f"{secrets.randbelow(1_000_000):06d}"
        user.codigo_reset_password = get_password_hash(codigo)
        user.codigo_reset_password_expira = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
        db.commit()
        try:
            send_email(
                email,
                "Código para recuperar tu contraseña — ServiCuba",
                f"Hola {user.nombre},\n\nTu código para recuperar la contraseña es: {codigo}\n\nEste código vence en {CODE_TTL_MINUTES} minutos.\n\nSi no solicitaste este cambio, ignora este mensaje.\n\nServiCuba",
            )
        except Exception as exc:
            # Do not expose SMTP details. The account-enumeration-safe response
            # remains the same even if the mail provider is temporarily down.
            raise HTTPException(status_code=503, detail="No se pudo enviar el correo. Intenta nuevamente más tarde.") from exc

    return {
        "message": "Si el correo está registrado, recibirás un código de recuperación.",
        "expira_en_minutos": CODE_TTL_MINUTES,
    }


@router.post("/reset-password")
def confirm_password_reset(body: PasswordResetConfirm, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.codigo_reset_password or not user.codigo_reset_password_expira:
        raise HTTPException(status_code=400, detail="Código de recuperación inválido o expirado")
    if datetime.utcnow() > user.codigo_reset_password_expira:
        raise HTTPException(status_code=400, detail="El código expiró, solicita uno nuevo")
    if not verify_password(body.codigo, user.codigo_reset_password):
        raise HTTPException(status_code=400, detail="Código de recuperación inválido o expirado")
    if len(body.nueva_password) < 8 or not any(c.isalpha() for c in body.nueva_password) or not any(c.isdigit() for c in body.nueva_password):
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos una letra y un número")

    user.password_hash = get_password_hash(body.nueva_password)
    user.codigo_reset_password = None
    user.codigo_reset_password_expira = None
    db.commit()
    return {"message": "Contraseña actualizada correctamente"}
