from email.message import EmailMessage
import smtplib
import ssl

from ..config import get_settings


def send_email(to_email: str, subject: str, text: str) -> None:
    """Send a transactional email through the configured SMTP server.

    Delivery configuration is intentionally kept in Render environment
    variables. No credentials or OTP values are logged or returned to clients.
    """
    settings = get_settings()
    if not settings.SMTP_HOST or not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD or not settings.SMTP_FROM_EMAIL:
        raise RuntimeError("El servicio de correo no está configurado")

    message = EmailMessage()
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text)

    context = ssl.create_default_context()
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
        if settings.SMTP_USE_TLS:
            server.starttls(context=context)
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(message)
