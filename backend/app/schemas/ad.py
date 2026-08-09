from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime


class AdResponse(BaseModel):
    id: UUID
    marca: str
    texto: str
    url_destino: Optional[str] = None
    contacto: Optional[str] = None
    categoria_id: Optional[int] = None
    activo: bool
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    impresiones: int
    clics: int
    payment_id: Optional[UUID] = None
    created_at: datetime
