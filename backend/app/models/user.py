from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from ..database import Base
import uuid
import enum

class UserRole(enum.Enum):
    CLIENTE = "cliente"
    TRABAJADOR = "trabajador"

class UserPlan(enum.Enum):
    GRATIS = "gratis"
    PREMIUM = "premium"

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(100), nullable=False)
    telefono = Column(String(20), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    rol = Column(Enum(UserRole), nullable=False)
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    ubicacion = Column(Geometry("POINT", srid=4326), nullable=True)
    municipio = Column(String(100), nullable=True)
    zona = Column(String(100), nullable=True)
    rating = Column(Float, default=0.0)
    foto = Column(String(255), nullable=True)
    verificado = Column(Boolean, default=False)
    codigo_verificacion = Column(String(10), nullable=True)
    codigo_verificacion_expira = Column(DateTime, nullable=True)
    plan = Column(Enum(UserPlan), default=UserPlan.GRATIS, nullable=False)
    plan_expira = Column(DateTime, nullable=True)
    es_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
