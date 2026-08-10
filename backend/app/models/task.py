from sqlalchemy import Column, String, Integer, Float, Text, DateTime, Boolean, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from ..database import Base
import uuid
import enum

class TaskStatus(enum.Enum):
    ACTIVA = "activa"
    ASIGNADA = "asignada"
    EN_PROCESO = "en_proceso"
    COMPLETADA = "completada"
    CANCELADA = "cancelada"

class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cliente_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    titulo = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)
    precio = Column(Float, nullable=True)
    ubicacion = Column(Geometry("POINT", srid=4326), nullable=False)
    municipio = Column(String(100), nullable=True)
    zona = Column(String(100), nullable=True)
    referencia = Column(Text, nullable=True)
    estado = Column(Enum(TaskStatus), default=TaskStatus.ACTIVA)
    # 'necesidad' (cliente busca un servicio — el único flujo implementado
    # hoy) vs 'oferta' (trabajador publica un servicio que ofrece, para
    # que un cliente lo "contrate" navegando ofertas). La columna existe
    # para no romper compatibilidad futura con ese marketplace simétrico,
    # pero ese flujo (crear/listar ofertas) TODAVÍA NO está implementado
    # — todas las tareas se crean hoy con tipo='necesidad'.
    tipo = Column(String(20), default="necesidad", nullable=False)
    destacada = Column(Boolean, default=False, nullable=False)
    destacada_hasta = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
