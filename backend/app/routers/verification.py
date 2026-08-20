import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.verification import VerificationConfirm
from ..services.auth import get_current_user
from ..services.email import send_email
from ..utils.security import get_password_hash, verify_password

router = APIRouter()
CODE_TTL_MINUTES = 10


@router.post("/send")
def send_verification_code(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.verificado:
        raise HTTPException(status_code=400, detail="Tu cuenta ya está verificada")
    if not current_user.email:
        raise HTTPException(status_code=400, detail="Tu cuenta no tiene un correo electrónico configurado")

    codigo = f"{secrets.randbelow(1_000_000):06d}"
    current_user.codigo_verificacion = get_password_hash(codigo)
    current_user.codigo_verificacion_expira = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
    db.commit()
    try:
        send_email(
            current_user.email,
            "Código de verificación — ServiCuba",
            f"Hola {current_user.nombre},\n\nTu código de verificación es: {codigo}\n\nEste código vence en {CODE_TTL_MINUTES} minutos.\n\nServiCuba",
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="No se pudo enviar el correo de verificación. Intenta nuevamente.") from exc

    return {"message": "Código de verificación enviado a tu correo.", "expira_en_minutos": CODE_TTL_MINUTES}


@router.post("/confirm")
def confirm_verification_code(body: VerificationConfirm, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.verificado:
        raise HTTPException(status_code=400, detail="Tu cuenta ya está verificada")
    if not current_user.codigo_verificacion or not current_user.codigo_verificacion_expira:
        raise HTTPException(status_code=400, detail="No hay ningún código pendiente, solicita uno nuevo")
    if datetime.utcnow() > current_user.codigo_verificacion_expira:
        raise HTTPException(status_code=400, detail="El código expiró, solicita uno nuevo")
    if not verify_password(body.codigo, current_user.codigo_verificacion):
        raise HTTPException(status_code=400, detail="Código incorrecto")

    current_user.verificado = True
    current_user.codigo_verificacion = None
    current_user.codigo_verificacion_expira = None
    db.commit()
    return {"message": "Cuenta verificada correctamente"}
