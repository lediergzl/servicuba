from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime

class TaskCreate(BaseModel):
    categoria_id: int
    titulo: str
    descripcion: Optional[str] = None
    precio: Optional[float] = None
    lat: float
    lng: float
    municipio: Optional[str] = None
    zona: Optional[str] = None
    referencia: Optional[str] = None

class TaskResponse(BaseModel):
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
    destacada: bool
    destacada_hasta: Optional[datetime] = None
    created_at: datetime

class TaskNearbyQuery(BaseModel):
    lat: float
    lng: float
    radius_km: float = 3.0
    category_id: Optional[int] = None
