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
    GRATIS = "gratis"
    BASE = "base"
    PREMIUM = "premium"

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(100), nullable=False)
    telefono = Column(String(20), unique=True, nullable=False)
    email = Column(String(254), unique=True, nullable=True, index=True)
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

    codigo_verificacion = Column(String(255), nullable=True)
    codigo_verificacion_expira = Column(DateTime, nullable=True)
    codigo_reset_password = Column(String(255), nullable=True)
    codigo_reset_password_expira = Column(DateTime, nullable=True)

    login_failed_attempts = Column(Integer, default=0, nullable=False)
    login_locked_until = Column(DateTime, nullable=True)
    login_last_failed_at = Column(DateTime, nullable=True)

    # Incrementar este valor invalida inmediatamente todos los JWT emitidos
    # anteriormente para el usuario. Se usa para logout real y futuras acciones
    # de seguridad como cambio de contraseña o cierre global de sesiones.
    token_version = Column(Integer, default=1, nullable=False)

    plan = Column(Enum(UserPlan), default=UserPlan.GRATIS, nullable=False)
    plan_expira = Column(DateTime, nullable=True)
    es_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
