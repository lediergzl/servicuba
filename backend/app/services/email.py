from email.message import EmailMessage
import logging
import smtplib
import ssl

import requests

from ..config import get_settings

logger = logging.getLogger(__name__)
BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email"


def _smtp_value(value: str | None) -> str:
    """Normalize values copied from provider dashboards without logging secrets."""
    return (value or "").strip().replace(r"\@", "@")


def _send_with_brevo_api(to_email: str, subject: str, text: str, api_key: str, from_email: str, from_name: str) -> None:
    payload = {
        "sender": {"email": from_email, "name": from_name},
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": text,
    }
    try:
        response = requests.post(
            BREVO_EMAIL_URL,
            headers={
                "accept": "application/json",
                "api-key": api_key,
                "content-type": "application/json",
            },
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        status = getattr(exc.response, "status_code", None) if getattr(exc, "response", None) is not None else None
        logger.exception(
            "Brevo API delivery failed: status=%s recipient_domain=%s",
            status,
            to_email.rsplit("@", 1)[-1] if "@" in to_email else "invalid",
        )
        raise RuntimeError("Brevo no pudo enviar el correo") from exc


def _send_with_smtp(to_email: str, subject: str, text: str) -> None:
    settings = get_settings()
    host = _smtp_value(settings.SMTP_HOST)
    username = _smtp_value(settings.SMTP_USERNAME)
    password = _smtp_value(settings.SMTP_PASSWORD)
    from_email = _smtp_value(settings.SMTP_FROM_EMAIL)

    if not host or not username or not password or not from_email:
        raise RuntimeError("El servicio de correo no está configurado correctamente")

    message = EmailMessage()
    message["From"] = f"{settings.SMTP_FROM_NAME} <{from_email}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text)

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP(host, settings.SMTP_PORT, timeout=20) as server:
            server.ehlo()
            if settings.SMTP_USE_TLS:
                server.starttls(context=context)
                server.ehlo()
            server.login(username, password)
            server.send_message(message)
    except Exception:
        logger.exception(
            "SMTP delivery failed: host=%s port=%s tls=%s recipient_domain=%s",
            host,
            settings.SMTP_PORT,
            settings.SMTP_USE_TLS,
            to_email.rsplit("@", 1)[-1] if "@" in to_email else "invalid",
        )
        raise


def send_email(to_email: str, subject: str, text: str) -> None:
    """Send transactional email via Brevo HTTPS API, with SMTP fallback."""
    settings = get_settings()
    from_email = _smtp_value(settings.SMTP_FROM_EMAIL)
    brevo_api_key = _smtp_value(settings.BREVO_API_KEY)

    if not from_email:
        logger.error("Email configuration incomplete: from_email is missing")
        raise RuntimeError("Falta configurar el remitente del correo")

    if brevo_api_key:
        _send_with_brevo_api(
            to_email=to_email,
            subject=subject,
            text=text,
            api_key=brevo_api_key,
            from_email=from_email,
            from_name=settings.SMTP_FROM_NAME,
        )
        return

    _send_with_smtp(to_email, subject, text)
