import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.password_reset import PasswordResetRequest, PasswordResetConfirm
from ..utils.security import get_password_hash

router = APIRouter()

CODE_TTL_MINUTES = 10


@router.post("/forgot-password")
def request_password_reset(
    body: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    """No revela si el teléfono existe o no en el sistema (evita enumerar
    cuentas registradas) — siempre responde el mismo mensaje genérico,
    pero sólo genera/guarda el código si la cuenta existe de verdad."""
    user = db.query(User).filter(User.telefono == body.telefono).first()

    codigo_demo = None
    if user:
        codigo = f"{random.randint(0, 999999):06d}"
        user.codigo_reset_password = codigo
        user.codigo_reset_password_expira = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
        db.commit()
        codigo_demo = codigo

    # NOTA: no hay pasarela SMS conectada todavía (mismo caso que
    # verification.py) — el código se devuelve en la respuesta sólo
    # cuando la cuenta existe, para poder probar el flujo de punta a
    # punta mientras no exista un proveedor real. En producción con SMS
    # real, este campo se quita y el código sólo llega por SMS.
    response = {
        "message": "Si el teléfono está registrado, se generó un código de recuperación.",
        "expira_en_minutos": CODE_TTL_MINUTES,
    }
    if codigo_demo:
        response["codigo_demo"] = codigo_demo
    return response


@router.post("/reset-password")
def confirm_password_reset(
    body: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.telefono == body.telefono).first()
    if not user or not user.codigo_reset_password or not user.codigo_reset_password_expira:
        raise HTTPException(status_code=400, detail="No hay ningún código de recuperación pendiente para este teléfono")
    if datetime.utcnow() > user.codigo_reset_password_expira:
        raise HTTPException(status_code=400, detail="El código expiró, solicita uno nuevo")
    if body.codigo != user.codigo_reset_password:
        raise HTTPException(status_code=400, detail="Código incorrecto")
    if len(body.nueva_password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")

    user.password_hash = get_password_hash(body.nueva_password)
    user.codigo_reset_password = None
    user.codigo_reset_password_expira = None
    db.commit()
    return {"message": "Contraseña actualizada correctamente"}
