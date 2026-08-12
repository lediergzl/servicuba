from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..services.auth import get_current_admin

router = APIRouter()


@router.post("/users/{user_id}/suspend")
def suspend_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Un administrador no puede suspenderse a sí mismo")
    user.suspendido = True
    db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": True}


@router.post("/users/{user_id}/unsuspend")
def unsuspend_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.suspendido = False
    db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": False}


@router.get("/users/{user_id}/status")
def user_status(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {
        "user_id": str(user.id),
        "suspendido": bool(user.suspendido),
        "verificado": bool(user.verificado),
        "es_admin": bool(user.es_admin),
        "plan": user.plan,
    }
