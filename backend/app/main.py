import asyncio
import logging
import time
from collections import defaultdict, deque
from pathlib import Path
from sqlalchemy import text
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from .routers import auth, users, categories, tasks, applications, reviews, chat, push, verification, payments, ads, password_reset, task_lifecycle, admin, discovery
from .database import engine, Base, SessionLocal
from .models.category import Category
from .models.user import User, UserRole
from .config import get_settings
from .utils.security import get_password_hash
from .services.notificaciones import procesar_notificaciones_pendientes

settings = get_settings()
logger = logging.getLogger("notificaciones")
app = FastAPI(title="Servicios Locales API", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["https://servicuba.onrender.com"], allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])
_RATE_WINDOWS = {"/api/auth/login": (10, 60), "/api/auth/register": (5, 300), "/api/auth/forgot-password": (3, 600), "/api/auth/reset-password": (5, 600), "/api/applications": (30, 60)}
_rate_events = defaultdict(deque)

def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"

@app.middleware("http")
async def sensitive_endpoint_rate_limit(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        path = request.url.path; matched = next((p for p in _RATE_WINDOWS if path == p or path.startswith(p + "/")), None)
        if matched:
            limit, window = _RATE_WINDOWS[matched]; now = time.monotonic(); key = f"{_client_key(request)}:{matched}"; events = _rate_events[key]
            while events and now - events[0] >= window: events.popleft()
            if len(events) >= limit:
                return JSONResponse(status_code=429, content={"detail": "Demasiadas solicitudes. Intenta nuevamente más tarde."}, headers={"Retry-After": str(max(1, int(window - (now - events[0]))))})
            events.append(now)
    return await call_next(request)

with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis")); conn.commit()
Base.metadata.create_all(bind=engine)
with engine.connect() as conn:
    conn.execute(text("ALTER TABLE users ALTER COLUMN rol DROP NOT NULL"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspendido BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_suspendido ON users (suspendido)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_verificacion VARCHAR(10)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_verificacion_expira TIMESTAMP"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'GRATIS'"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expira TIMESTAMP"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS es_admin BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS es_cliente BOOLEAN NOT NULL DEFAULT true"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS es_trabajador BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS modo_activo VARCHAR(20) NOT NULL DEFAULT 'cliente'"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categories(id)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS descripcion_trabajador TEXT"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS precio_hora DOUBLE PRECISION"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS ubicacion geometry(POINT, 4326)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS municipio VARCHAR(100)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS zona VARCHAR(100)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS foto VARCHAR(255)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION DEFAULT 0.0"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verificado BOOLEAN DEFAULT false"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_reset_password VARCHAR(255)"))
    conn.execute(text("ALTER TABLE users ALTER COLUMN codigo_reset_password TYPE VARCHAR(255)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_reset_password_expira TIMESTAMP"))
    conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS destacada BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS destacada_hasta TIMESTAMP"))
    conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'necesidad'"))
    conn.execute(text("ALTER TYPE taskstatus ADD VALUE IF NOT EXISTS 'CONFIRMADA'"))
    conn.execute(text("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'REEMBOLSADO'"))
    conn.execute(text("ALTER TABLE payments ADD COLUMN IF NOT EXISTS entitlement_expires_at TIMESTAMP"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_tasks_ubicacion_geog ON tasks USING GIST ((ubicacion::geography))"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_tasks_estado_categoria ON tasks (estado, categoria_id)"))
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_task_worker ON applications (task_id, worker_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_applications_task_status ON applications (task_id, estado)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_applications_worker_created ON applications (worker_id, created_at)"))
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_task ON reviews (task_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reviews_worker ON reviews (trabajador_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reviews_client ON reviews (cliente_id)"))
    conn.commit()
_DEFAULT_CATEGORIES = [(1, "Electricista", "⚡"), (2, "Plomero", "🔧"), (3, "Reparador", "🛠"), (4, "Albañil", "🧱")]
with SessionLocal() as db:
    if db.query(Category).count() == 0:
        for cat_id, nombre, icono in _DEFAULT_CATEGORIES: db.add(Category(id=cat_id, nombre=nombre, icono=icono, activo=True))
        db.commit()
if settings.ADMIN_PHONE and settings.ADMIN_PASSWORD:
    with SessionLocal() as db:
        admin_user = db.query(User).filter(User.telefono == settings.ADMIN_PHONE).first()
        if admin_user: admin_user.es_admin = True
        else: db.add(User(nombre="Administrador", telefono=settings.ADMIN_PHONE, password_hash=get_password_hash(settings.ADMIN_PASSWORD), rol=UserRole.CLIENTE, verificado=True, es_admin=True))
        db.commit()
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(password_reset.router, prefix="/api/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(categories.router, prefix="/api/categories", tags=["Categories"])
app.include_router(discovery.router, prefix="/api/discovery", tags=["Discovery"])
app.include_router(task_lifecycle.router, prefix="/api/tasks", tags=["Task lifecycle"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(reviews.router, prefix="/api/reviews", tags=["Reviews"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(push.router, prefix="/api/push", tags=["Push"])
app.include_router(verification.router, prefix="/api/verification", tags=["Verification"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(ads.router, prefix="/api/ads", tags=["Ads"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
@app.get("/api/health")
def health():
    try:
        with engine.connect() as conn: conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}
    except Exception:
        logger.exception("Health check: database unavailable")
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Servicio temporalmente no disponible")
NOTIFICACIONES_INTERVALO_SEGUNDOS = 60
async def _bucle_notificaciones_pendientes():
    while True:
        await asyncio.sleep(NOTIFICACIONES_INTERVALO_SEGUNDOS); db = SessionLocal()
        try: procesar_notificaciones_pendientes(db)
        except Exception: logger.exception("Fallo procesando la cola de notificaciones pendientes")
        finally: db.close()
@app.on_event("startup")
async def _iniciar_bucle_notificaciones(): asyncio.create_task(_bucle_notificaciones_pendientes())
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
if FRONTEND_DIR.is_dir(): app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
