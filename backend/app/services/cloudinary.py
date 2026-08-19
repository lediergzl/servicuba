"""Signed direct-to-Cloudinary uploads for ServiCuba images.

Render's local filesystem is ephemeral, so image bytes must never be stored on the
web service. The backend only creates short-lived signed upload parameters and
validates the Cloudinary URL before it is persisted.
"""
from urllib.parse import urlparse
import time

import cloudinary
import cloudinary.utils
from fastapi import HTTPException

from ..config import get_settings

settings = get_settings()
_CLOUDINARY_CONFIGURED = False


def _ensure_configured() -> None:
    global _CLOUDINARY_CONFIGURED
    if not (
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    ):
        raise HTTPException(
            status_code=503,
            detail="La subida de fotos no está configurada todavía. Contacta al equipo de ServiCuba.",
        )
    if not _CLOUDINARY_CONFIGURED:
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )
        _CLOUDINARY_CONFIGURED = True


def create_upload_signature(folder: str) -> dict:
    """Return signed parameters for a direct browser -> Cloudinary upload.

    The caller never supplies the folder freely; routers choose an allowlisted
    folder before calling this function.
    """
    _ensure_configured()
    timestamp = int(time.time())
    params = {"timestamp": timestamp, "folder": folder}
    signature = cloudinary.utils.api_sign_request(
        params, settings.CLOUDINARY_API_SECRET
    )
    return {
        "timestamp": timestamp,
        "signature": signature,
        "api_key": settings.CLOUDINARY_API_KEY,
        "cloud_name": settings.CLOUDINARY_CLOUD_NAME,
        "folder": folder,
    }


def validar_url_foto(url: str) -> str:
    """Accept only HTTPS URLs hosted by this ServiCuba Cloudinary cloud."""
    if not settings.CLOUDINARY_CLOUD_NAME:
        raise HTTPException(
            status_code=503,
            detail="La subida de fotos no está configurada todavía.",
        )

    parsed = urlparse(url.strip())
    expected_host = f"res.cloudinary.com"
    expected_prefix = f"/{settings.CLOUDINARY_CLOUD_NAME}/"
    if (
        parsed.scheme != "https"
        or parsed.hostname != expected_host
        or not parsed.path.startswith(expected_prefix)
    ):
        raise HTTPException(status_code=400, detail="URL de foto inválida.")
    return url.strip()
