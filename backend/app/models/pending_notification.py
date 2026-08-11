from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base
import uuid


class PendingNotification(Base):
    """Cola persistente de avisos push retrasados — hoy sólo la usa el
    aviso de "nueva tarea cercana" a trabajadores del plan gratis (ver
    services/notificaciones.py y routers/tasks.py): los Premium se avisan
    al instante (push síncrono normal, igual que el resto de la app), los
    del plan gratis PUSH_PRIORIDAD_PREMIUM_MINUTOS más tarde — dándole al
    plan Pro una ventana real de ventaja para postularse primero.

    Se persiste en vez de resolverse con un simple `asyncio.sleep` en
    memoria por aviso para que un redeploy/reinicio de Render durante esa
    espera NO pierda el aviso: el loop de background en main.py revisa
    esta tabla cada minuto y manda cualquier fila vencida, incluso si su
    `enviar_en` ya pasó mientras el proceso estaba caído (llega un poco
    tarde en ese caso puntual, pero nunca se pierde)."""
    __tablename__ = "pending_notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    worker_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    titulo = Column(String(200), nullable=False)
    cuerpo = Column(Text, nullable=False)
    url = Column(String(500), nullable=False, default="/")
    # Indexado: es el campo por el que el loop de background filtra en
    # cada pasada ("¿qué venció ya?") — sin índice, esa consulta escanea
    # toda la tabla cada minuto para siempre.
    enviar_en = Column(DateTime, nullable=False, index=True)
    enviado = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
