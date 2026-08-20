from sqlalchemy import Column, String, Integer, Text, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base
import uuid


class Ad(Base):
    __tablename__ = "ads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Anuncios creados por trabajadores PREMIUM. Se mantiene marca para
    # compatibilidad con el inventario comercial anterior.
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    marca = Column(String(100), nullable=False)
    titulo = Column(String(160), nullable=True)
    texto = Column(Text, nullable=False)
    imagen = Column(String(500), nullable=True)
    precio_servicio = Column(Float, nullable=True)
    estado = Column(String(20), default="pendiente_pago", nullable=False, index=True)
    url_destino = Column(String(500), nullable=True)
    contacto = Column(String(50), nullable=True)
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    activo = Column(Boolean, default=False, nullable=False)
    fecha_inicio = Column(DateTime, nullable=True)
    fecha_fin = Column(DateTime, nullable=True)
    impresiones = Column(Integer, default=0, nullable=False)
    clics = Column(Integer, default=0, nullable=False)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
