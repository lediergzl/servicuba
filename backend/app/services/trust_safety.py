from fastapi import HTTPException
from ..models.user import User


def require_active_account(user: User) -> None:
    """Central gate for future account suspension/deactivation.

    Keep this check in one place so business routers do not each invent
    their own interpretation of account status. The current schema has no
    suspension flag, so existing accounts remain active; adding the flag
    later requires changing this service and one model/migration instead
    of auditing every endpoint again.
    """
    if getattr(user, "suspendido", False):
        raise HTTPException(status_code=403, detail="Tu cuenta está suspendida")
