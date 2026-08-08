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


class Payment(Base):
    """
    Registro de cobro agnóstico de pasarela. Cuba no tiene un procesador de
    pagos digital estándar integrable hoy, así que este modelo representa
    la INTENCIÓN de pago (el usuario la crea) y un administrador la
    confirma manualmente (ej. tras recibir una transferencia bancaria o
    efectivo) — ver routers/payments.py. `referencia` guarda el id del
    recurso afectado (task_id para destacar, etc.) y `notas` guarda
    detalles adicionales en texto libre/JSON (ej. los datos de un anuncio
    antes de que exista como fila en `ads`).

    Cuando se integre una pasarela real, el campo `referencia_externa`
    queda listo para guardar el id de transacción del proveedor, y el
    endpoint de confirmación puede dispararse desde un webhook en vez de
    un admin — el resto del flujo (aplicar el efecto según `tipo`) no
    cambia.
    """
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
    created_at = Column(DateTime, server_default=func.now())
    confirmed_at = Column(DateTime, nullable=True)
