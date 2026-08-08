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
