import asyncio
import logging
import time
from collections import defaultdict, deque
from pathlib import Path
from html import escape
import json

from sqlalchemy import text
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, HTMLResponse

from .routers import auth, users, categories, tasks, applications, reviews, chat, push, native_push, notifications_stream, verification, payments, ads, password_reset, task_lifecycle, admin, discovery, dashboard, reports, uploads
from .database import engine, SessionLocal
from .models.category import Category
from .models.user import User, UserRole
from .config import get_settings
from .utils.security import get_password_hash
from .services.notificaciones import procesar_notificaciones_pendientes

settings = get_settings()
logger = logging.getLogger("notificaciones")
app = FastAPI(title="Servicios Locales API", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["https://servicuba.onrender.com"], allow_credentials=False, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])
_RATE_WINDOWS = {"/api/auth/login": (10, 60), "/api/auth/register": (5, 300), "/api/auth/forgot-password": (3, 600), "/api/auth/reset-password": (5, 600), "/api/applications": (30, 60)}
_rate_events = defaultdict(deque)

def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"

@app.middleware("http")
async def sensitive_endpoint_rate_limit(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        path = request.url.path
        matched = next((p for p in _RATE_WINDOWS if path == p or path.startswith(p + "/")), None)
        if matched:
            limit, window = _RATE_WINDOWS[matched]
            now = time.monotonic()
            key = f"{_client_key(request)}:{matched}"
            events = _rate_events[key]
            while events and now - events[0] >= window:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window - (now - events[0])))
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Demasiadas solicitudes. Intenta nuevamente más tarde."},
                    headers={"Retry-After": str(retry_after)},
                )
            events.append(now)
    return await call_next(request)

_DEFAULT_CATEGORIES = [(1, "Electricista", "⚡"), (2, "Plomero", "🔧"), (3, "Reparador", "🛠"), (4, "Albañil", "🧱")]
with SessionLocal() as db:
    if db.query(Category).count() == 0:
        for cat_id, nombre, icono in _DEFAULT_CATEGORIES:
            db.add(Category(id=cat_id, nombre=nombre, icono=icono, activo=True))
        db.commit()

if settings.ADMIN_PHONE and settings.ADMIN_PASSWORD:
    with SessionLocal() as db:
        admin_user = db.query(User).filter(User.telefono == settings.ADMIN_PHONE).first()
        if admin_user:
            admin_user.es_admin = True
        else:
            db.add(User(nombre="Administrador", telefono=settings.ADMIN_PHONE, password_hash=get_password_hash(settings.ADMIN_PASSWORD), rol=UserRole.CLIENTE, verificado=True, es_admin=True))
        db.commit()

for router, prefix, tags in [
    (auth.router, "/api/auth", ["Auth"]), (password_reset.router, "/api/auth", ["Auth"]),
    (users.router, "/api/users", ["Users"]), (categories.router, "/api/categories", ["Categories"]),
    (discovery.router, "/api/discovery", ["Discovery"]), (dashboard.router, "/api/dashboard", ["Dashboard"]),
    (task_lifecycle.router, "/api/tasks", ["Task lifecycle"]), (tasks.router, "/api/tasks", ["Tasks"]),
    (applications.router, "/api/applications", ["Applications"]), (reviews.router, "/api/reviews", ["Reviews"]),
    (reports.router, "/api/reports", ["Reports"]), (chat.router, "/api/chat", ["Chat"]),
    (push.router, "/api/push", ["Push"]), (native_push.router, "/api/push", ["Native Push"]),
    (notifications_stream.router, "/api/push", ["Push Stream"]),
    (verification.router, "/api/verification", ["Verification"]), (payments.router, "/api/payments", ["Payments"]),
    (ads.router, "/api/ads", ["Ads"]), (admin.router, "/api/admin", ["Admin"]),
    (uploads.router, "/api/uploads", ["Uploads"]),
]:
    app.include_router(router, prefix=prefix, tags=tags)

@app.get("/api/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}
    except Exception:
        logger.exception("Health check: database unavailable")
        raise HTTPException(status_code=503, detail="Servicio temporalmente no disponible")

SEO_CITIES = {"la-habana": "La Habana", "santiago-de-cuba": "Santiago de Cuba", "holguin": "Holguín", "camaguey": "Camagüey", "santa-clara": "Santa Clara"}
SEO_SERVICES = {"electricistas": "Electricistas", "plomeros": "Plomeros", "reparadores": "Reparadores", "albaniles": "Albañiles", "pintores": "Pintores"}
SEO_BASE = "https://servicuba.onrender.com"

def _seo_document(title: str, description: str, canonical: str, body: str) -> HTMLResponse:
    schema = json.dumps({"@context": "https://schema.org", "@type": "WebPage", "name": title, "description": description, "url": canonical, "isPartOf": {"@type": "WebSite", "name": "ServiCuba", "url": SEO_BASE}}, ensure_ascii=False)
    html = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title><meta name="description" content="{escape(description)}"><link rel="canonical" href="{escape(canonical)}"><meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="{escape(canonical)}"><script type="application/ld+json">{schema}</script></head><body><main>{body}</main></body></html>'''
    return HTMLResponse(html)

@app.get("/servicios", response_class=HTMLResponse, include_in_schema=False)
def public_services_index():
    links = "".join(f'<li><a href="/servicios/{slug}">{escape(name)}</a></li>' for slug, name in SEO_SERVICES.items())
    return _seo_document("Servicios locales en Cuba | ServiCuba", "Encuentra servicios locales y trabajadores por oficio y municipio en ServiCuba.", f"{SEO_BASE}/servicios", f'<h1>Servicios locales en Cuba</h1><p>Explora oficios y encuentra trabajadores locales.</p><ul>{links}</ul><p><a href="/">Volver a ServiCuba</a></p>')

@app.get("/servicios/{service}", response_class=HTMLResponse, include_in_schema=False)
def public_service_index(service: str):
    service_name = SEO_SERVICES.get(service.lower())
    if not service_name:
        raise HTTPException(status_code=404, detail="Página no encontrada")
    links = "".join(f'<li><a href="/servicios/{service}/{city}">{escape(service_name)} en {escape(city_name)}</a></li>' for city, city_name in SEO_CITIES.items())
    return _seo_document(f"{service_name} en Cuba | ServiCuba", f"Encuentra {service_name.lower()} por municipio en ServiCuba.", f"{SEO_BASE}/servicios/{service}", f'<h1>{escape(service_name)} en Cuba</h1><p>Busca profesionales locales por municipio.</p><ul>{links}</ul><p><a href="/servicios">Ver todos los servicios</a></p>')

@app.get("/servicios/{service}/{city}", response_class=HTMLResponse, include_in_schema=False)
def public_service_page(service: str, city: str):
    service_name = SEO_SERVICES.get(service.lower())
    city_name = SEO_CITIES.get(city.lower())
    if not service_name or not city_name:
        raise HTTPException(status_code=404, detail="Página no encontrada")
    canonical = f"{SEO_BASE}/servicios/{service}/{city}"
    city_links = "".join(f'<li><a href="/servicios/{service}/{other_city}">{escape(service_name)} en {escape(other_name)}</a></li>' for other_city, other_name in SEO_CITIES.items() if other_city != city)
    return _seo_document(f"{service_name} en {city_name} | ServiCuba", f"Encuentra servicios de {service_name.lower()} en {city_name}. ServiCuba conecta personas con trabajadores locales.", canonical, f'<h1>{escape(service_name)} en {escape(city_name)}</h1><p>Encuentra y contacta trabajadores locales para servicios de {escape(service_name.lower())} en {escape(city_name)}.</p><p>Publica lo que necesitas o explora profesionales y servicios disponibles en tu zona.</p><p><a href="/">Entrar a ServiCuba</a> · <a href="/servicios/{service}">Ver {escape(service_name.lower())} en otros municipios</a></p><h2>Otros municipios</h2><ul>{city_links}</ul>')

NOTIFICACIONES_INTERVALO_SEGUNDOS = 60
async def _bucle_notificaciones_pendientes():
    while True:
        await asyncio.sleep(NOTIFICACIONES_INTERVALO_SEGUNDOS)
        db = SessionLocal()
        try:
            procesar_notificaciones_pendientes(db)
        except Exception:
            logger.exception("Fallo procesando la cola de notificaciones pendientes")
        finally:
            db.close()

@app.on_event("startup")
async def _iniciar_bucle_notificaciones():
    asyncio.create_task(_bucle_notificaciones_pendientes())

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
@app.get("/sitemap.xml", include_in_schema=False)
def public_sitemap():
    urls = [SEO_BASE + "/", SEO_BASE + "/servicios"]
    urls.extend(f"{SEO_BASE}/servicios/{service}" for service in SEO_SERVICES)
    urls.extend(f"{SEO_BASE}/servicios/{service}/{city}" for service in SEO_SERVICES for city in SEO_CITIES)
    xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f'<url><loc>{u}</loc><changefreq>weekly</changefreq><priority>{"1.0" if u == SEO_BASE + "/" else "0.8" if u.endswith("/servicios") else "0.7"}</priority></url>' for u in urls) + "</urlset>"
    return HTMLResponse(content=xml, media_type="application/xml")

if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
