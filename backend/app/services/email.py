from email.message import EmailMessage
import logging
import smtplib
import ssl

from ..config import get_settings

logger = logging.getLogger(__name__)


def _smtp_value(value: str | None) -> str:
    """Normalize values copied from provider dashboards without logging secrets."""
    return (value or "").strip().replace(r"\@", "@")


def send_email(to_email: str, subject: str, text: str) -> None:
    """Send a transactional email through the configured SMTP server."""
    settings = get_settings()
    host = _smtp_value(settings.SMTP_HOST)
    username = _smtp_value(settings.SMTP_USERNAME)
    password = _smtp_value(settings.SMTP_PASSWORD)
    from_email = _smtp_value(settings.SMTP_FROM_EMAIL)

    if not host or not username or not password or not from_email:
        logger.error(
            "SMTP configuration incomplete: host=%s username=%s password=%s from_email=%s",
            bool(host), bool(username), bool(password), bool(from_email),
        )
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
