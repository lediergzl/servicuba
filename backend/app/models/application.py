from sqlalchemy import Column, Text, DateTime, Enum, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base
import uuid
import enum

class AppStatus(enum.Enum):
    PENDIENTE = "pendiente"
    ACEPTADA = "aceptada"
    RECHAZADA = "rechazada"

class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        # A user can have at most one application/request per publication.
        # The router also checks this for a friendly error, but the DB must
        # enforce it so concurrent requests cannot create duplicates.
        UniqueConstraint("task_id", "worker_id", name="uq_applications_task_worker"),
        Index("ix_applications_task_status", "task_id", "estado"),
        Index("ix_applications_worker_created", "worker_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    worker_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    mensaje = Column(Text, nullable=True)
    estado = Column(Enum(AppStatus), default=AppStatus.PENDIENTE, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
