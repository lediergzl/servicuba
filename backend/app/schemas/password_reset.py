from pydantic import BaseModel, EmailStr, Field


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    codigo: str = Field(min_length=6, max_length=6)
    nueva_password: str = Field(min_length=8, max_length=128)
