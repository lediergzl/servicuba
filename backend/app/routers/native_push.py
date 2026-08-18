from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.native_push_token import NativePushToken
from ..services.auth import get_current_user

router = APIRouter()


@router.post("/native-token")
def register_native_token(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = str(body.get("token") or "").strip()
    platform = str(body.get("platform") or "android").strip().lower()
    if not token:
        raise HTTPException(status_code=422, detail="token es obligatorio")
    if platform not in {"android", "ios"}:
        platform = "android"

    existing = db.query(NativePushToken).filter(NativePushToken.token == token).first()
    if existing:
        existing.user_id = current_user.id
        existing.platform = platform
        existing.active = "true"
    else:
        db.add(NativePushToken(user_id=current_user.id, token=token, platform=platform, active="true"))
    db.commit()
    return {"message": "Token nativo guardado"}


@router.post("/native-token/revoke")
def revoke_native_token(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = str(body.get("token") or "").strip()
    if token:
        db.query(NativePushToken).filter(
            NativePushToken.token == token,
            NativePushToken.user_id == current_user.id,
        ).update({"active": "false"})
        db.commit()
    return {"message": "Token nativo revocado"}
