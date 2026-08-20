import json
import logging
from uuid import UUID

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from ..models.push_subscription import PushSubscription
from ..utils.vapid_keys import get_or_create_vapid_key_path
from ..config import get_settings
from . import live_events

logger = logging.getLogger("push")
settings = get_settings()
_VAPID_KEY_PATH = get_or_create_vapid_key_path()


def send_push_to_user(db: Session, user_id: UUID, title: str, body: str, url: str = "/"):
    """Envía push/SSE y elimina suscripciones caducadas con un solo commit."""
    live_events.emitir(user_id, {"title": title, "body": body, "url": url})
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    if not subs:
        return

    payload = json.dumps({"title": title, "body": body, "url": url})
    deleted_any = False
    for sub in subs:
        subscription_info = {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}}
        try:
            webpush(subscription_info=subscription_info, data=payload,
                    vapid_private_key=str(_VAPID_KEY_PATH),
                    vapid_claims={"sub": settings.VAPID_CLAIM_EMAIL})
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else None
            if status in (404, 410):
                db.delete(sub)
                deleted_any = True
            else:
                logger.warning("Push falló para %s: %s", user_id, exc)
        except Exception as exc:
            logger.warning("Push falló para %s: %s", user_id, exc)
    if deleted_any:
        db.commit()
