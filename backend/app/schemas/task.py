from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from typing import Optional
from datetime import datetime


class TaskCreate(BaseModel):
    categoria_id: int = Field(..., gt=0)
    titulo: str = Field(..., min_length=3, max_length=100)
    descripcion: Optional[str] = Field(None, max_length=2000)
    precio: Optional[float] = Field(None, ge=0)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    municipio: Optional[str] = Field(None, max_length=100)
    zona: Optional[str] = Field(None, max_length=100)
    referencia: Optional[str] = Field(None, max_length=500)


class TaskUpdate(BaseModel):
    # Todo opcional: sólo se actualizan los campos que vengan presentes.
    # No incluye lat/lng/categoria_id a propósito: editar la ubicación o
    # la categoría después de publicar puede invalidar postulaciones ya
    # realizadas. Para eso conviene cancelar y crear una nueva publicación.
    titulo: Optional[str] = Field(None, min_length=3, max_length=100)
    descripcion: Optional[str] = Field(None, max_length=2000)
    precio: Optional[float] = Field(None, ge=0)
    municipio: Optional[str] = Field(None, max_length=100)
    zona: Optional[str] = Field(None, max_length=100)
    referencia: Optional[str] = Field(None, max_length=500)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cliente_id: UUID
    categoria_id: int
    titulo: str
    descripcion: Optional[str]
    precio: Optional[float]
    municipio: Optional[str]
    zona: Optional[str]
    referencia: Optional[str]
    estado: str
    tipo: str = "necesidad"
    destacada: bool
    destacada_hasta: Optional[datetime] = None
    created_at: datetime


class TaskNearbyQuery(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius_km: float = Field(3.0, ge=0.1, le=50)
    category_id: Optional[int] = Field(None, gt=0)
