from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime


class SponsorAdRequest(BaseModel):
    marca: str
    texto: str
    url_destino: Optional[str] = None
    contacto: Optional[str] = None
    categoria_id: Optional[int] = None
    dias: int = 7


class PaymentResponse(BaseModel):
    id: UUID
    user_id: UUID
    tipo: str
    estado: str
    monto: float
    moneda: str
    referencia: Optional[str]
    notas: Optional[str]
    created_at: datetime
    confirmed_at: Optional[datetime]
