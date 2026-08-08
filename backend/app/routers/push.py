from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.push_subscription import PushSubscription
from ..schemas.push import PushSubscriptionCreate, PushUnsubscribe
from ..services.auth import get_current_user
from ..utils.vapid_keys import get_or_create_vapid_key_path, get_vapid_public_key_b64

router = APIRouter()

_VAPID_KEY_PATH = get_or_create_vapid_key_path()
_VAPID_PUBLIC_KEY = get_vapid_public_key_b64(_VAPID_KEY_PATH)


@router.get("/vapid-public-key")
def vapid_public_key():
    # El frontend necesita esta clave para pushManager.subscribe(...).
    return {"publicKey": _VAPID_PUBLIC_KEY}


@router.post("/subscribe")
def subscribe(
    sub: PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == sub.endpoint).first()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = sub.keys.p256dh
        existing.auth = sub.keys.auth
    else:
        db.add(PushSubscription(
            user_id=current_user.id,
            endpoint=sub.endpoint,
            p256dh=sub.keys.p256dh,
            auth=sub.keys.auth,
        ))
    db.commit()
    return {"message": "Suscripción guardada"}


@router.post("/unsubscribe")
def unsubscribe(
    body: PushUnsubscribe,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint,
        PushSubscription.user_id == current_user.id,
    ).delete()
    db.commit()
    return {"message": "Suscripción eliminada"}
