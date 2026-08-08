from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime

class ApplicationCreate(BaseModel):
    mensaje: Optional[str] = None

class ApplicationResponse(BaseModel):
    id: UUID
    task_id: UUID
    worker_id: UUID
    mensaje: Optional[str]
    estado: str
    created_at: datetime
