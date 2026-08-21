from functools import lru_cache

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    VAPID_CLAIM_EMAIL: str = "mailto:soporte@servicuba.example"
    ADMIN_PHONE: str | None = None
    ADMIN_PASSWORD: str | None = None
    CLOUDINARY_CLOUD_NAME: str | None = None
    CLOUDINARY_API_KEY: str | None = None
    CLOUDINARY_API_SECRET: str | None = None

    # Brevo HTTP API is preferred on Render because outbound SMTP can time out.
    BREVO_API_KEY: str | None = None

    # SMTP remains as a fallback for local/other deployments.
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str | None = None
    SMTP_FROM_NAME: str = "ServiCuba"
    SMTP_USE_TLS: bool = True


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
