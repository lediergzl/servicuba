from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    nombre: str
    telefono: str
    password: str
    # Ya no se elige un rol fijo al registrarse — todo usuario puede
    # publicar tareas (es_cliente=True siempre, ver auth.py). Este
    # checkbox opcional ("¿También ofreces servicios?") activa el perfil
    # de trabajador desde el registro; si no se marca, se puede activar
    # después desde el perfil (PUT /users/activar-trabajador).
    es_trabajador: bool = False
    categoria_id: Optional[int] = None
    descripcion_trabajador: Optional[str] = None
    precio_hora: Optional[float] = None
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
    rating: float
    verificado: bool
    plan: str
    plan_expira: Optional[datetime] = None
    es_admin: bool
    created_at: datetime
    # Dualidad de roles — reemplaza al antiguo campo único `rol`.
    es_cliente: bool
    es_trabajador: bool
    modo_activo: str
    # Perfil de trabajador — sólo tiene sentido si es_trabajador=True.
    categoria_id: Optional[int] = None
    categoria_nombre: Optional[str] = None
    categoria_icono: Optional[str] = None
    descripcion_trabajador: Optional[str] = None
    precio_hora: Optional[float] = None
    municipio: Optional[str] = None
    zona: Optional[str] = None

class ActivarTrabajadorRequest(BaseModel):
    categoria_id: int
    descripcion_trabajador: Optional[str] = None
    precio_hora: Optional[float] = None
    municipio: Optional[str] = None
    zona: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class ModoActivoRequest(BaseModel):
    modo: str  # 'cliente' | 'trabajador'
