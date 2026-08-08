# ServiCuba - Plataforma de Servicios Locales

## Descripción
Plataforma PWA para conectar clientes y trabajadores en Cuba mediante geolocalización.

## Tecnologías
- Backend: FastAPI, PostgreSQL con PostGIS (hospedado en Supabase)
- Frontend: PWA (HTML5, Tailwind, JavaScript Vanilla)
- Mapas: Leaflet + OpenStreetMap

## Instalación Local

### Requisitos
- Python 3.11+
- PostgreSQL 15+ con PostGIS
- pip

### Pasos
1. Clonar repositorio (mantener `backend/` y `frontend/` como hermanos — el
   backend sirve `frontend/` como estáticos usando una ruta relativa).
2. Crear entorno virtual: `python -m venv venv`
3. Activar: `source venv/bin/activate` (Linux/Mac) o `venv\Scripts\activate` (Windows)
4. Instalar dependencias: `pip install -r backend/requirements.txt`
5. Instalar PostgreSQL 15+ con la extensión PostGIS disponible (no hace falta
   crearla a mano: el backend ejecuta `CREATE EXTENSION IF NOT EXISTS postgis`
   al arrancar).
6. Crear la base de datos vacía (ej. `createdb servicios_db`).
7. Configurar `backend/.env` (copiando `.env.example`) con `DATABASE_URL` y `SECRET_KEY`.
8. Iniciar: `cd backend && uvicorn app.main:app --reload`
9. Abrir `http://localhost:8000/` — el backend sirve el frontend directamente,
   no hace falta un servidor estático aparte.

Las tablas y las categorías por defecto (Electricista, Plomero, Reparador,
Albañil — ids 1-4, que es lo que el frontend asume) se crean automáticamente
en el primer arranque contra una base de datos vacía.

## Base de datos (Supabase)

Se usa Supabase en vez de la base de datos administrada de Render porque
**el plan free de Render borra el Postgres a los 30 días** — el free tier
de Supabase persiste indefinidamente (solo se pausa tras ~1 semana sin
tráfico, y se reactiva sola con la primera petición que le llegue, que
puede tardar unos segundos).

### Crear el proyecto
1. Crear cuenta/proyecto en [supabase.com](https://supabase.com) (plan free).
2. Habilitar PostGIS: en el dashboard, **Database → Extensions**, buscar
   `postgis` y activarla. (No es estrictamente necesario hacerlo a mano —
   el backend ya ejecuta `CREATE EXTENSION IF NOT EXISTS postgis` al
   arrancar — pero confirmarlo en el dashboard evita sorpresas si el rol
   de conexión no tuviera permiso.)
3. Ir a **Project Settings → Database → Connection string** y copiar la
   del **"Session pooler"** (puerto `5432`), **no** la conexión directa ni
   la del "Transaction pooler" (puerto `6543`):
   - La conexión **directa** en el plan free de Supabase es IPv6-only —
     Render no siempre tiene salida IPv6, así que suele fallar en silencio
     (timeout de conexión).
   - El **Transaction pooler** (6543) no soporta el ciclo de vida de
     conexión que espera el pool propio de SQLAlemy/psycopg2 tan bien como
     el Session pooler para una app de larga duración como esta (no es
     una función serverless de una sola query).
   - El **Session pooler** (5432) es compatible con IPv4 y se comporta
     como un Postgres normal — es el que hay que usar acá.
4. Pegar esa cadena completa (con la contraseña real, no el placeholder)
   como `DATABASE_URL` — local en `backend/.env`, en producción en la
   variable de entorno del servicio en Render.

### Notas
- `backend/app/database.py` ya configura `pool_pre_ping=True` (para que una
  conexión muerta tras la pausa de inactividad de Supabase se renueve sola
  en vez de tirar un error) y límites de pool conservadores (`pool_size=5`,
  `max_overflow=5`) acordes al límite de conexiones del plan free.
- La primera petición después de que el proyecto estuvo pausado puede
  tardar varios segundos mientras Supabase lo reactiva — es esperado, no
  un error.

## Despliegue en Render
- Conectar repositorio de GitHub.
- Usar `render.yaml` proporcionado (un único Web Service sirve API + frontend).
- Crear el proyecto de Supabase primero (ver sección anterior) y pegar su
  cadena de conexión en la variable `DATABASE_URL` del servicio en Render
  (el `render.yaml` la declara con `sync: false`, así que Render la va a
  pedir en el dashboard — no hay base de datos de Render que provisionar).
- **Antes del primer deploy**, generar la clave VAPID (necesaria para
  notificaciones push) y pegarla en Render:
  ```bash
  python backend/generate_vapid_key.py
  ```
  Copiar la salida completa (con `-----BEGIN/END PRIVATE KEY-----`) en la
  variable de entorno `VAPID_PRIVATE_KEY_PEM` del servicio, en el dashboard
  de Render (el `render.yaml` ya declara la variable con `sync: false`,
  así que Render la va a pedir). Si se omite este paso, la app genera una
  clave sola al arrancar — pero el plan free de Render tiene disco efímero,
  así que **cada redeploy generaría una clave distinta e invalidaría todas
  las suscripciones push que los navegadores ya guardaron**. Verificado:
  con la variable puesta, la clave pública derivada es idéntica entre
  arranques aunque se borre el disco.

## Notas de esta versión (revisión y correcciones)
- **`bcrypt` fijado a `4.0.1`**: `passlib[bcrypt]==1.7.4` es incompatible con
  `bcrypt>=4.1` (rompe con `AttributeError: module 'bcrypt' has no attribute
  '__about__'` y luego `ValueError` al hashear). Sin este pin, **registro y
  login fallan siempre**. Verificado con un hash/verify real.
- **`numpy<2` agregado**: `shapely==2.0.2` (usado por `geoalchemy2`) está
  compilado contra NumPy 1.x y no importa bajo NumPy 2.x
  (`AttributeError: _ARRAY_API not found`). Sin este pin, **el backend no
  arranca**.
- **Categorías sembradas automáticamente** al iniciar si la tabla está vacía
  (antes no había seed: registrar un trabajador o crear una tarea fallaba
  por violación de foreign key, ya que el frontend asume ids 1-4).
- **`CREATE EXTENSION IF NOT EXISTS postgis`** se ejecuta antes de crear las
  tablas (las columnas `Geometry` fallan si la extensión no existe).
- **Frontend servido por el propio backend** (`StaticFiles` montado en `/`):
  antes `render.yaml` sólo desplegaba la API y el frontend no se servía en
  ningún lado. Ahora un único servicio expone `/` (frontend) y `/api/*`
  (backend), sin configurar CORS entre dominios.
- **`GET /api/tasks/my`** agregado — el frontend ya lo llamaba pero no existía.
- **`POST /api/tasks/{id}/complete`** agregado — sin esta ruta era imposible
  llegar al estado `completada` que exige `POST /api/reviews/`, dejando ese
  router inalcanzable.
- **`NameError` corregido en `reviews.py`** (faltaba `from sqlalchemy import func`).
- **Registro con rol inválido** ahora responde `400` en vez de `500`.
- `frontend/js/tasks.js` usa un módulo propio de toasts/modales (sin
  `alert`/`prompt`), con escape de HTML, `AbortController` para evitar
  carreras de peticiones, y delegación de eventos.
- **Probado de punta a punta** contra un PostgreSQL + PostGIS real: arranque
  limpio, registro, login, crear tarea, buscar cercanas, postularse, aceptar
  postulación, completar tarea, dejar reseña y verificar que el rating del
  trabajador se actualiza.

## Monetización

El sistema de cobro es **agnóstico de pasarela**: como Cuba no tiene un
procesador de pagos digital estándar integrable hoy, cada acción de pago
crea un registro `Payment` en estado `pendiente` con instrucciones, y un
**administrador lo confirma manualmente** (tras recibir una transferencia,
efectivo, etc.) — el beneficio se activa solo al confirmar. Cuando se
integre una pasarela real, el mismo flujo se dispara desde un webhook en
vez de un botón de admin.

**Cómo crear un admin**: definir `ADMIN_PHONE` y `ADMIN_PASSWORD` en el
entorno (ya están en `render.yaml` como `sync: false` — Render las pide en
el dashboard). Al arrancar, ese usuario se crea o se promueve a admin
automáticamente. Sin esto, nadie puede confirmar pagos ni gestionar
anuncios.

### Fuentes de ingreso implementadas (`app/services/plans.py` tiene los precios)

1. **Suscripción premium para trabajadores** — plan gratis: 3
   postulaciones/semana, radio de búsqueda máx. 3 km. Premium ($5/30 días):
   postulaciones ilimitadas, radio hasta 50 km. `POST /api/payments/subscribe`.
2. **Tareas destacadas** — el cliente paga ($2/7 días) para que su tarea
   aparezca primero en los resultados de trabajadores cercanos.
   `POST /api/payments/feature-task/{task_id}`.
3. **Anuncios de marcas** — cualquier usuario puede solicitar patrocinar un
   anuncio ($3/día), segmentado por categoría opcional, con impresiones y
   clics medidos. `POST /api/payments/sponsor-ad`, entrega pública en
   `GET /api/ads/active`.

Endpoints de administración: `GET /api/payments/pending`,
`POST /api/payments/{id}/confirm`, `POST /api/payments/{id}/reject`,
`GET /api/ads/`, `POST /api/ads/{id}/toggle`.

## Próximos pasos
- Mejorar interfaz de usuario. ✅ (rediseño completo con sistema de marca propio)
- Añadir chat en tiempo real. ✅
- Implementar notificaciones push. ✅
- Verificación de usuarios. ✅
- Monetización (suscripción, tareas destacadas, anuncios). ✅
- Íconos PWA reales (`icon-192.png`/`icon-512.png` no existen todavía).
- Panel de administración con interfaz (hoy los endpoints de admin sólo
  tienen API, sin pantalla propia — un admin los usaría vía `/docs` o un
  cliente HTTP).
- Pasarela de pago real cuando exista una integrable desde Cuba.

## Licencia
MIT
