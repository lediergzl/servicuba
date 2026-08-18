from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base
import uuid


class NativePushToken(Base):
    __tablename__ = "native_push_tokens"
    __table_args__ = (UniqueConstraint("token", name="uq_native_push_token"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(1024), nullable=False)
    platform = Column(String(20), nullable=False, default="android")
    active = Column(String(5), nullable=False, default="true")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
