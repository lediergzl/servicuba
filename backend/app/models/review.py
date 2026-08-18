from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base
import uuid


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("task_id", name="uq_reviews_task"),
        Index("ix_reviews_worker", "trabajador_id"),
        Index("ix_reviews_client", "cliente_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    cliente_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    trabajador_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    calidad_trabajo = Column(Integer, nullable=True)
    trato = Column(Integer, nullable=True)
    puntualidad = Column(Integer, nullable=True)
    precio_acordado = Column(Integer, nullable=True)
    comentario = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
