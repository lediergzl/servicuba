from pydantic import BaseModel


class PasswordResetRequest(BaseModel):
    telefono: str


class PasswordResetConfirm(BaseModel):
    telefono: str
    codigo: str
    nueva_password: str
