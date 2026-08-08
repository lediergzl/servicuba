from pydantic import BaseModel


class VerificationConfirm(BaseModel):
    codigo: str
