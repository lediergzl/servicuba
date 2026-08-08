from sqlalchemy import Column, String, Integer, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base
import uuid


class Ad(Base):
    __tablename__ = "ads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    marca = Column(String(100), nullable=False)
    texto = Column(Text, nullable=False)
    url_destino = Column(String(500), nullable=True)
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)  # null = general
    activo = Column(Boolean, default=False, nullable=False)  # se activa al confirmar el pago
    fecha_inicio = Column(DateTime, nullable=True)
    fecha_fin = Column(DateTime, nullable=True)
    impresiones = Column(Integer, default=0, nullable=False)
    clics = Column(Integer, default=0, nullable=False)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
