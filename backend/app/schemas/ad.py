from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional
from datetime import datetime


class PromotionalAdCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=160)
    descripcion: str = Field(min_length=10, max_length=5000)
    imagen: Optional[str] = Field(default=None, max_length=500)
    precio_servicio: Optional[float] = Field(default=None, ge=0)
    categoria_id: Optional[int] = None
    contacto: Optional[str] = Field(default=None, max_length=50)


class AdResponse(BaseModel):
    id: UUID
    marca: str
    titulo: Optional[str] = None
    texto: str
    imagen: Optional[str] = None
    precio_servicio: Optional[float] = None
    estado: str = "pendiente_pago"
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
