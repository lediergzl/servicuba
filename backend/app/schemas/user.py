from pydantic import BaseModel, ConfigDict, Field, field_validator
from uuid import UUID
from typing import Optional
from datetime import datetime
import re


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    nombre: str = Field(min_length=2, max_length=100)
    telefono: str = Field(min_length=7, max_length=30)
    password: str = Field(min_length=8, max_length=128)
    es_trabajador: bool = False
    categoria_id: Optional[int] = Field(default=None, ge=1)
    descripcion_trabajador: Optional[str] = Field(default=None, max_length=2000)
    precio_hora: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    municipio: Optional[str] = Field(default=None, max_length=120)
    zona: Optional[str] = Field(default=None, max_length=120)

    @field_validator("telefono")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        normalized = re.sub(r"[\s().-]", "", value)
        if not re.fullmatch(r"\+?[0-9]{7,20}", normalized):
            raise ValueError("Teléfono inválido")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("La contraseña no puede estar vacía")
        if not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value):
            raise ValueError("La contraseña debe contener al menos una letra y un número")
        return value


class UserLogin(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    telefono: str = Field(min_length=7, max_length=30)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("telefono")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        normalized = re.sub(r"[\s().-]", "", value)
        if not re.fullmatch(r"\+?[0-9]{7,20}", normalized):
            raise ValueError("Teléfono inválido")
        return normalized


class Token(BaseModel):
    access_token: str
    token_type: str


class UserEntitlements(BaseModel):
    puede_contratar: bool
    puede_publicar_servicios: bool
    servicios_por_dia: int
    postulaciones_por_semana: Optional[int] = None
    radio_max_km: float
    puede_publicar_anuncios: bool
    anuncios_por_dia: int
    puede_destacar_tareas: bool


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
    es_cliente: bool
    es_trabajador: bool
    modo_activo: str
    categoria_id: Optional[int] = None
    categoria_nombre: Optional[str] = None
    categoria_icono: Optional[str] = None
    descripcion_trabajador: Optional[str] = None
    precio_hora: Optional[float] = None
    municipio: Optional[str] = None
    zona: Optional[str] = None
    entitlements: UserEntitlements


class ActivarTrabajadorRequest(BaseModel):
    categoria_id: int = Field(ge=1)
    descripcion_trabajador: Optional[str] = Field(default=None, max_length=2000)
    precio_hora: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    municipio: Optional[str] = Field(default=None, max_length=120)
    zona: Optional[str] = Field(default=None, max_length=120)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)


class ModoActivoRequest(BaseModel):
    modo: str

    @field_validator("modo")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        if value not in {"cliente", "trabajador"}:
            raise ValueError("Modo activo inválido")
        return value
