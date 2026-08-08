from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.category import Category

router = APIRouter()

@router.get("/")
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).filter(Category.activo == True).all()
