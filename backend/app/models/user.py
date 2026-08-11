from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from ..database import Base
import uuid
import enum

class UserRole(enum.Enum):
    """DEPRECADO — se mantiene sólo porque la columna `rol` ya existe en
    bases de datos desplegadas y SQLAlchemy necesita el tipo Enum para
    poder seguir mapeando esa columna sin romper el arranque. Ningún
    endpoint nuevo lee ni escribe `rol`: la app ahora usa
    `es_cliente`/`es_trabajador` (columnas booleanas independientes) para
    que un mismo usuario pueda tener ambos perfiles a la vez, en vez de
    un rol fijo elegido al registrarse. Ver la migración en main.py que
    relaja el NOT NULL de esta columna y hace el backfill de las cuentas
    existentes hacia el nuevo esquema."""
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

    # DEPRECADO — ver nota en UserRole más arriba. Nullable a propósito:
    # ya no se asigna en el registro ni se lee en ningún router.
    rol = Column(Enum(UserRole), nullable=True)

    # ---------- Dualidad de roles ----------
    # Un mismo usuario puede publicar tareas (cliente) y/o ofrecer sus
    # servicios (trabajador) al mismo tiempo, sin registrarse dos veces.
    # es_cliente empieza en True para todos (publicar una tarea nunca
    # requirió "activar" nada); es_trabajador empieza en False y se
    # activa cuando el usuario completa su perfil de oficio (ver
    # PUT /users/activar-trabajador).
    es_cliente = Column(Boolean, default=True, nullable=False)
    es_trabajador = Column(Boolean, default=False, nullable=False)

    # Qué panel ve el usuario al entrar. Se persiste en el SERVIDOR (no
    # sólo en localStorage) para que la app "recuerde" el último modo
    # elegido aunque entre desde otro dispositivo o borre datos del
    # navegador — ver PUT /users/modo-activo.
    modo_activo = Column(String(20), default="cliente", nullable=False)

    # ---------- Perfil de trabajador (sólo aplica si es_trabajador=True) ----------
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
    codigo_verificacion = Column(String(10), nullable=True)
    codigo_verificacion_expira = Column(DateTime, nullable=True)

    # ---------- Recuperación de contraseña ----------
    # Mismo patrón que codigo_verificacion/codigo_verificacion_expira de
    # arriba (código de un solo uso con TTL) — ver routers/password_reset.py.
    # No hay pasarela SMS conectada todavía (igual que verification.py),
    # así que el endpoint devuelve el código en la respuesta sólo para
    # poder probar el flujo de punta a punta mientras no exista un
    # proveedor real.
    codigo_reset_password = Column(String(10), nullable=True)
    codigo_reset_password_expira = Column(DateTime, nullable=True)

    plan = Column(Enum(UserPlan), default=UserPlan.GRATIS, nullable=False)
    plan_expira = Column(DateTime, nullable=True)
    es_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
