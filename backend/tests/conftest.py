import os

# Keep unit tests independent from production secrets/database.  The app
# package imports settings during module discovery, so CI needs harmless test
# defaults before pytest imports application modules.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-not-for-production")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
os.environ.setdefault("REFRESH_TOKEN_EXPIRE_DAYS", "7")
os.environ.setdefault("VAPID_CLAIM_EMAIL", "mailto:test@example.invalid")
