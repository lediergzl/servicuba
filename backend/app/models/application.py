from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey
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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    worker_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    mensaje = Column(Text, nullable=True)
    estado = Column(Enum(AppStatus), default=AppStatus.PENDIENTE)
    created_at = Column(DateTime, server_default=func.now())
