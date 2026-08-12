from sqlalchemy import Column, String, Text, Float, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base
import uuid
import enum


class PaymentType(enum.Enum):
    SUSCRIPCION_TRABAJADOR = "suscripcion_trabajador"
    TAREA_DESTACADA = "tarea_destacada"
    ANUNCIO = "anuncio"


class PaymentStatus(enum.Enum):
    PENDIENTE = "pendiente"
    CONFIRMADO = "confirmado"
    RECHAZADO = "rechazado"
    REEMBOLSADO = "reembolsado"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    tipo = Column(Enum(PaymentType), nullable=False)
    estado = Column(Enum(PaymentStatus), default=PaymentStatus.PENDIENTE, nullable=False)
    monto = Column(Float, nullable=False)
    moneda = Column(String(10), default="USD", nullable=False)
    referencia = Column(String(255), nullable=True)
    referencia_externa = Column(String(255), nullable=True)
    notas = Column(Text, nullable=True)
    entitlement_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    confirmed_at = Column(DateTime, nullable=True)
