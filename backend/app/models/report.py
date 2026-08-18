import enum
import uuid

from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from ..database import Base


class ReportReason(enum.Enum):
    SPAM = "spam"
    INAPROPIADO = "inapropiado"
    ESTAFA = "estafa"
    FUERA_DE_PROPOSITO = "fuera_de_proposito"
    OTRO = "otro"


class ReportStatus(enum.Enum):
    PENDIENTE = "pendiente"
    REVISADA = "revisada"
    DESCARTADA = "descartada"
    ACCIONADA = "accionada"


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("task_id", "reporter_id", name="uq_reports_task_reporter"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reason = Column(Enum(ReportReason), nullable=False)
    details = Column(Text, nullable=True)
    status = Column(Enum(ReportStatus), nullable=False, default=ReportStatus.PENDIENTE, index=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    moderator_note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
