from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import get_settings

settings = get_settings()

# pool_pre_ping: Supabase (plan free) pausa el proyecto tras ~1 semana sin
# uso y además su pooler puede cerrar conexiones inactivas — sin esto, la
# primera petición tras un rato de inactividad fallaría con una conexión
# muerta en vez de reconectar sola.
# pool_size/max_overflow conservadores: el pooler de Supabase en el plan
# free tiene un límite de conexiones simultáneas compartido con el resto
# del proyecto (Studio, otros servicios, etc.) — no tiene sentido pedir
# más de las que un solo servicio web pequeño necesita.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    pool_recycle=300,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
