from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class MessageCreate(BaseModel):
    contenido: str


class MessageResponse(BaseModel):
    id: UUID
    task_id: UUID
    sender_id: UUID
    contenido: str
    leido: bool
    created_at: datetime
