from pydantic import BaseModel
from typing import Optional


class CategoryCreate(BaseModel):
    nombre: str
    icono: Optional[str] = None


class CategoryResponse(BaseModel):
    id: int
    nombre: str
    icono: Optional[str]
    activo: bool
