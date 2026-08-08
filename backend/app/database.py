from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import get_settings

settings = get_settings()

# pool_pre_ping: Neon (plan free) "escala a cero" el cómputo tras ~5 min sin
# uso — la conexión se corta y Neon reactiva el cómputo solo en la próxima
# conexión nueva (unos cientos de ms a pocos segundos). Sin pre_ping, la
# primera petición tras ese hibernado fallaría con una conexión muerta en
# el pool en vez de descartarla y abrir una nueva.
# pool_size/max_overflow conservadores: acordes a un solo servicio web
# pequeño; de más no sirve ya que el pooler de Neon (PgBouncer) multiplexa
# igual del lado del servidor.
# pool_recycle: recicla conexiones cada 5 min para no aferrarse a una
# conexión que el hibernado de Neon ya cortó del otro lado.
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
