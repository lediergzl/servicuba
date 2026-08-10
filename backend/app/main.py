from pathlib import Path
from sqlalchemy import text
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from .routers import auth, users, categories, tasks, applications, reviews, chat, push, verification, payments, ads
from .database import engine, Base, SessionLocal
from .models.category import Category
from .models.user import User, UserRole
from .config import get_settings
from .utils.security import get_password_hash

settings = get_settings()

app = FastAPI(title="Servicios Locales API", version="1.0.0")

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # Bearer tokens van en el header Authorization, no en cookies,
    # así que no se necesitan credenciales de CORS (y "*" + credentials=True
    # es una combinación que los navegadores rechazan igualmente).
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PostGIS debe existir ANTES de crear las tablas, porque los modelos
# usan columnas Geometry (users.ubicacion, tasks.ubicacion).
with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    conn.commit()

Base.metadata.create_all(bind=engine)

# create_all() sólo crea tablas que no existen — no altera tablas ya
# desplegadas. Si esta versión se instala sobre una base de datos de una
# versión anterior (antes de la verificación de usuarios), a "users" le
# faltarían estas dos columnas. Es idempotente y no afecta instalaciones
# nuevas (ya las crea create_all).
with engine.connect() as conn:
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_verificacion VARCHAR(10)"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_verificacion_expira TIMESTAMP"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'GRATIS'"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expira TIMESTAMP"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS es_admin BOOLEAN NOT NULL DEFAULT false"
    ))
    # Dualidad de roles (cliente + trabajador a la vez, ver models/user.py):
    # bases de datos desplegadas ANTES de esta migración (cuando el
    # usuario tenía un `rol` fijo) no tienen estas tres columnas. Sin
    # esto, cualquier fila vieja rompe con ResponseValidationError
    # ("Field required": es_cliente/es_trabajador/modo_activo) en cuanto
    # se serializa contra UserResponse — visto en /auth/register al
    # devolver el ORM crudo, pero afecta a CUALQUIER endpoint que toque
    # esa fila (GET /users/profile incluido) si la columna directamente
    # no existe en la tabla.
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS es_cliente BOOLEAN NOT NULL DEFAULT true"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS es_trabajador BOOLEAN NOT NULL DEFAULT false"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS modo_activo VARCHAR(20) NOT NULL DEFAULT 'cliente'"
    ))
    # Perfil de trabajador (activar-trabajador) — mismo problema que
    # es_cliente/es_trabajador/modo_activo arriba: una base de datos
    # desplegada antes de que existiera la activación de perfil de
    # trabajador no tiene NINGUNA de estas columnas. Se vio en producción
    # con una cuenta vieja que rompía en descripcion_trabajador — como
    # todas se agregaron juntas en la misma época, se migran todas de
    # una vez para no ir descubriéndolas una por una en cada deploy.
    # Todas nullable (sin valor por defecto real): son opcionales hasta
    # que el usuario activa el modo trabajador.
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categories(id)"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS descripcion_trabajador TEXT"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS precio_hora DOUBLE PRECISION"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS ubicacion geometry(POINT, 4326)"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS municipio VARCHAR(100)"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS zona VARCHAR(100)"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS foto VARCHAR(255)"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION DEFAULT 0.0"
    ))
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS verificado BOOLEAN DEFAULT false"
    ))
    conn.execute(text(
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS destacada BOOLEAN NOT NULL DEFAULT false"
    ))
    conn.execute(text(
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS destacada_hasta TIMESTAMP"
    ))
    # Marketplace de ofertas (trabajador publica, cliente solicita) — ver
    # models/task.py y services/nearby.py. Mismo patrón: una tabla tasks
    # vieja no tiene esta columna, y el router la filtra explícitamente
    # (Task.tipo == tipo), así que rompería igual que las de arriba en
    # cuanto se use /tasks/ofertas/nearby contra esta base de datos.
    conn.execute(text(
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'necesidad'"
    ))
    # Contacto (teléfono/WhatsApp) del anunciante — antes el banner de
    # anuncio sólo mostraba un enlace si había url_destino; un negocio sin
    # sitio web quedaba sin ninguna forma de que lo contactaran.
    conn.execute(text(
        "ALTER TABLE ads ADD COLUMN IF NOT EXISTS contacto VARCHAR(50)"
    ))
    # ---------- Índices para /api/tasks/nearby ----------
    # Esa consulta filtra por Task.estado y castea Task.ubicacion a
    # geography para usar ST_DWithin/ST_Distance (ver routers/tasks.py).
    # Sin un índice que calce con ESE cast, Postgres tiene que escanear
    # toda la tabla de tareas en cada búsqueda "cercanas" — en una
    # conexión lenta eso duplica el problema: además del round-trip lento
    # del cliente, el propio backend tarda más en responder. El índice
    # GIST se crea sobre la expresión "ubicacion::geography" (idéntica al
    # cast que usa la query) para que el planner realmente pueda usarlo.
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_tasks_ubicacion_geog "
        "ON tasks USING GIST ((ubicacion::geography))"
    ))
    # Filtro compuesto habitual de esa misma consulta (estado='activa' +
    # categoría opcional) — acelera el filtrado antes de llegar al cálculo
    # de distancia.
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_tasks_estado_categoria "
        "ON tasks (estado, categoria_id)"
    ))
    conn.commit()

# Categorías por defecto: el frontend (regCategoria / filtroCategoria /
# VALID_CATEGORY_IDS en tasks.js) asume que existen los ids 1-4.
# Sin este seed, el registro de trabajadores y la creación de tareas
# fallan por violación de foreign key contra una tabla vacía.
_DEFAULT_CATEGORIES = [
    (1, "Electricista", "⚡"),
    (2, "Plomero", "🔧"),
    (3, "Reparador", "🛠"),
    (4, "Albañil", "🧱"),
]
with SessionLocal() as db:
    if db.query(Category).count() == 0:
        for cat_id, nombre, icono in _DEFAULT_CATEGORIES:
            db.add(Category(id=cat_id, nombre=nombre, icono=icono, activo=True))
        db.commit()

# Admin opcional: si se definen ADMIN_PHONE + ADMIN_PASSWORD en el entorno,
# se crea (o se promueve a admin, si ya existía) ese usuario al arrancar.
# Es la única forma de tener un admin — no hay endpoint público para
# auto-otorgarse el rol. Sin esto, nadie puede confirmar pagos ni
# gestionar anuncios.
if settings.ADMIN_PHONE and settings.ADMIN_PASSWORD:
    with SessionLocal() as db:
        admin_user = db.query(User).filter(User.telefono == settings.ADMIN_PHONE).first()
        if admin_user:
            admin_user.es_admin = True
        else:
            admin_user = User(
                nombre="Administrador",
                telefono=settings.ADMIN_PHONE,
                password_hash=get_password_hash(settings.ADMIN_PASSWORD),
                rol=UserRole.CLIENTE,
                verificado=True,
                es_admin=True,
            )
            db.add(admin_user)
        db.commit()

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(categories.router, prefix="/api/categories", tags=["Categories"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(reviews.router, prefix="/api/reviews", tags=["Reviews"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(push.router, prefix="/api/push", tags=["Push"])
app.include_router(verification.router, prefix="/api/verification", tags=["Verification"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(ads.router, prefix="/api/ads", tags=["Ads"])

@app.get("/api/health")
def health():
    return {"message": "Plataforma de Servicios Locales - API"}

# Sirve el frontend (index.html, css/, js/, manifest.json, etc.) como un
# único servicio web — así las rutas relativas /api/... del frontend
# funcionan sin configurar CORS/proxy por separado. Se monta AL FINAL
# para no tapar las rutas /api/* de arriba.
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
