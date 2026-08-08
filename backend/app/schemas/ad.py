from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime


class AdResponse(BaseModel):
    id: UUID
    marca: str
    texto: str
    url_destino: Optional[str]
    categoria_id: Optional[int]
    activo: bool
    fecha_inicio: Optional[datetime]
    fecha_fin: Optional[datetime]
    impresiones: int
    clics: int
