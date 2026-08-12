from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.audit_log import AuditLog
from ..models.user import User
from ..services.auth import get_current_admin

router = APIRouter()


def _audit(db: Session, admin: User, action: str, target_type: str, target_id: str, details: str | None = None):
    db.add(AuditLog(actor_id=admin.id, action=action, target_type=target_type, target_id=str(target_id), details=details))


@router.post("/users/{user_id}/suspend")
def suspend_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Un administrador no puede suspenderse a sí mismo")
    user.suspendido = True
    _audit(db, admin, "USER_SUSPENDED", "user", str(user.id))
    db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": True}


@router.post("/users/{user_id}/unsuspend")
def unsuspend_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.suspendido = False
    _audit(db, admin, "USER_UNSUSPENDED", "user", str(user.id))
    db.commit()
    return {"ok": True, "user_id": str(user.id), "suspendido": False}


@router.get("/users/{user_id}/status")
def user_status(user_id: str, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"user_id": str(user.id), "suspendido": bool(user.suspendido), "verificado": bool(user.verificado), "es_admin": bool(user.es_admin), "plan": user.plan}


@router.get("/audit")
def audit_log(limit: int = 100, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    limit = max(1, min(limit, 200))
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{"id": row.id, "actor_id": row.actor_id, "action": row.action, "target_type": row.target_type, "target_id": row.target_id, "details": row.details, "created_at": row.created_at.isoformat()} for row in rows]
