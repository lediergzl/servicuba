from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional
from datetime import datetime

class ReviewCreate(BaseModel):
    task_id: UUID
    trabajador_id: UUID
    rating: int = Field(..., ge=1, le=5)
    comentario: Optional[str] = None

class ReviewResponse(BaseModel):
    id: UUID
    task_id: UUID
    cliente_id: UUID
    trabajador_id: UUID
    rating: int
    comentario: Optional[str]
    created_at: datetime
