from sqlalchemy import Column, Integer, String, Boolean
from ..database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)
    icono = Column(String(50), nullable=True)
    activo = Column(Boolean, default=True)
