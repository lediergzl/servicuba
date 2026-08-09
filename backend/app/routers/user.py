from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    nombre: str
    telefono: str
    password: str
    rol: str
    categoria_id: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    municipio: Optional[str] = None
    zona: Optional[str] = None

class UserLogin(BaseModel):
    telefono: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    id: UUID
    nombre: str
    telefono: str
    rol: str
    rating: float
    verificado: bool
    plan: str
    plan_expira: Optional[datetime] = None
    es_admin: bool
    created_at: datetime
    # Oficio del trabajador — antes el perfil no distinguía en nada al
    # trabajador del cliente más allá de la etiqueta "Trabajador"/"Cliente".
    # None para clientes (no tienen categoria_id) o si la categoría fue
    # desactivada.
    categoria_id: Optional[int] = None
    categoria_nombre: Optional[str] = None
    categoria_icono: Optional[str] = None
