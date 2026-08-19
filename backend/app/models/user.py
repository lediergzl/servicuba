from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from ..database import Base
import uuid
import enum

class UserRole(enum.Enum):
    """Deprecated legacy role kept only for the existing database column."""
    CLIENTE = "cliente"
    TRABAJADOR = "trabajador"

class UserPlan(enum.Enum):
    # GRATIS = cliente/consumidor. BASE = profesional que publica servicios.
    # PREMIUM = profesional con promoción/visibilidad adicional.
    GRATIS = "gratis"
    BASE = "base"
    PREMIUM = "premium"

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(100), nullable=False)
    telefono = Column(String(20), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    rol = Column(Enum(UserRole), nullable=True)

    es_cliente = Column(Boolean, default=True, nullable=False)
    es_trabajador = Column(Boolean, default=False, nullable=False)
    modo_activo = Column(String(20), default="cliente", nullable=False)
    suspendido = Column(Boolean, default=False, index=True)

    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    descripcion_trabajador = Column(Text, nullable=True)
    precio_hora = Column(Float, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    ubicacion = Column(Geometry("POINT", srid=4326), nullable=True)
    municipio = Column(String(100), nullable=True)
    zona = Column(String(100), nullable=True)

    rating = Column(Float, default=0.0)
    foto = Column(String(255), nullable=True)
    verificado = Column(Boolean, default=False)

    # Verification codes are stored as bcrypt hashes, not plaintext OTPs.
    codigo_verificacion = Column(String(255), nullable=True)
    codigo_verificacion_expira = Column(DateTime, nullable=True)

    # Password recovery stores a bcrypt hash, not the six-digit code.
    codigo_reset_password = Column(String(255), nullable=True)
    codigo_reset_password_expira = Column(DateTime, nullable=True)

    # Account-level brute-force protection. These values survive process restarts
    # and complement the IP-based middleware limiter.
    login_failed_attempts = Column(Integer, default=0, nullable=False)
    login_locked_until = Column(DateTime, nullable=True)
    login_last_failed_at = Column(DateTime, nullable=True)

    plan = Column(Enum(UserPlan), default=UserPlan.GRATIS, nullable=False)
    plan_expira = Column(DateTime, nullable=True)
    es_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
