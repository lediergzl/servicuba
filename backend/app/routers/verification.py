import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.verification import VerificationConfirm
from ..services.auth import get_current_user

router = APIRouter()

CODE_TTL_MINUTES = 10


@router.post("/send")
def send_verification_code(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.verificado:
        raise HTTPException(status_code=400, detail="Tu cuenta ya está verificada")

    codigo = f"{random.randint(0, 999999):06d}"
    current_user.codigo_verificacion = codigo
    current_user.codigo_verificacion_expira = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
    db.commit()

    # NOTA: no hay pasarela de SMS/WhatsApp conectada todavía. En producción,
    # este es el punto donde se llamaría a un proveedor real (ej. Twilio,
    # una pasarela local cubana, etc.) pasándole `current_user.telefono` y
    # `codigo`. Mientras tanto, se devuelve el código en la respuesta para
    # poder probar el flujo de verificación de punta a punta.
    return {
        "message": "Código de verificación generado",
        "codigo_demo": codigo,
        "expira_en_minutos": CODE_TTL_MINUTES,
    }


@router.post("/confirm")
def confirm_verification_code(
    body: VerificationConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.verificado:
        raise HTTPException(status_code=400, detail="Tu cuenta ya está verificada")
    if not current_user.codigo_verificacion or not current_user.codigo_verificacion_expira:
        raise HTTPException(status_code=400, detail="No hay ningún código pendiente, solicita uno nuevo")
    if datetime.utcnow() > current_user.codigo_verificacion_expira:
        raise HTTPException(status_code=400, detail="El código expiró, solicita uno nuevo")
    if body.codigo != current_user.codigo_verificacion:
        raise HTTPException(status_code=400, detail="Código incorrecto")

    current_user.verificado = True
    current_user.codigo_verificacion = None
    current_user.codigo_verificacion_expira = None
    db.commit()
    return {"message": "Cuenta verificada correctamente"}
