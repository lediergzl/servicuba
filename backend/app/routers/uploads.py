from fastapi import APIRouter, Depends, Query
from ..services.cloudinary import create_upload_signature
from ..utils.auth import get_current_user
from ..models.user import User

router = APIRouter()

_ALLOWED_FOLDERS = {
    "task": "servicuba/tasks",
    "profile": "servicuba/profiles",
}


@router.get("/signature")
def upload_signature(
    kind: str = Query("task", pattern="^(task|profile)$"),
    current_user: User = Depends(get_current_user),
):
    """Create signed parameters for a direct upload from the authenticated client."""
    return create_upload_signature(_ALLOWED_FOLDERS[kind])
