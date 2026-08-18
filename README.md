# ServiCuba - Plataforma de Servicios Locales

## Modelo de producto
ServiCuba conecta personas que necesitan resolver un problema con profesionales que ofrecen servicios locales. No es un clasificados generalista: las publicaciones de servicio están separadas de los anuncios promocionales.

### Tres niveles
- **FREE**: descubre profesionales y contrata servicios.
- **BASE**: profesional que ofrece servicios; 1 publicación de servicio por día.
- **PREMIUM**: profesional con mayor capacidad y promoción; hasta 10 servicios por día, radio ampliado y anuncios promocionales.

Una tarea/necesidad puede recibir múltiples postulaciones. Sólo deja de estar disponible cuando el cliente asigna el trabajo.

## Descripción
Plataforma PWA para conectar clientes y trabajadores en Cuba mediante geolocalización.

## Tecnologías
- Backend: FastAPI, PostgreSQL con PostGIS (hospedado en Neon)
- Frontend: PWA (HTML5, Tailwind, JavaScript Vanilla)
- Mapas: Leaflet + OpenStreetMap

## Instalación Local

### Requisitos
- Python 3.11+
- PostgreSQL 15+ con PostGIS
- pip

### Pasos
1. Clonar repositorio (mantener `backend/` y `frontend/` como hermanos — el backend sirve `frontend/` como estáticos usando una ruta relativa).
2. Crear entorno virtual: `python -m venv venv`
3. Activar: `source venv/bin/activate` (Linux/Mac) o `venv\Scripts\activate` (Windows)
4. Instalar dependencias: `pip install -r backend/requirements.txt`
5. Instalar PostgreSQL 15+ con la extensión PostGIS disponible (el backend ejecuta `CREATE EXTENSION IF NOT EXISTS postgis` al arrancar).
6. Crear la base de datos vacía.
7. Configurar `backend/.env` con `DATABASE_URL` y `SECRET_KEY`.
8. Iniciar: `cd backend && uvicorn app.main:app --reload`
9. Abrir `http://localhost:8000/`.

Las categorías por defecto (Electricista, Plomero, Reparador y Albañil) se crean automáticamente si la tabla está vacía.

## Base de datos (Neon)
Se usa Neon para PostgreSQL/PostGIS. En producción, configurar `DATABASE_URL` con la conexión SSL de Neon.

## Despliegue en Render
- Conectar el repositorio de GitHub.
- Usar `render.yaml` proporcionado.
- Configurar `DATABASE_URL`, `SECRET_KEY`, variables de administración y VAPID según el entorno.
- Un único Web Service sirve la API y el frontend.

## Marketplace

### Necesidades / tareas
Una necesidad pertenece al lado cliente: describe un trabajo que alguien necesita resolver. Los trabajadores pueden postularse. El dueño no puede postularse a su propia publicación.

La publicación permanece `ACTIVA` mientras pueda recibir postulaciones. Al aceptar una postulación pasa a `ASIGNADA` y las demás solicitudes se rechazan.

### Servicios profesionales
Una oferta pertenece al lado trabajador: describe un servicio que el profesional sabe realizar. Sólo perfiles de trabajador pueden publicarlas.

### Anuncios
Los anuncios son una entidad comercial independiente. No son tareas ni servicios y no deben mezclarse con el feed principal. La solicitud de un anuncio promocional está reservada a profesionales Premium y requiere confirmación administrativa del pago antes de hacerse pública.

## Reputación y moderación
El sistema contempla reseñas posteriores al trabajo, verificación, denuncias y herramientas administrativas. Las experiencias deben asociarse a trabajos reales para evitar que la reputación se convierta en un simple contador de estrellas.

## Monetización
El cobro es agnóstico de pasarela: cada acción crea un registro `Payment` pendiente y un administrador confirma manualmente el pago. El beneficio se activa sólo tras confirmación.

Fuentes actuales:
1. Suscripción Premium para profesionales — $5/30 días.
2. Tareas destacadas — $2/7 días.
3. Anuncios Premium — $3/día, sujetos a las reglas del plan.

## Estado técnico
- Backend FastAPI + PostgreSQL/PostGIS.
- Frontend PWA servido por el backend.
- Dualidad Cliente/Trabajador.
- Descubrimiento público y directorio por municipio.
- Chat y notificaciones push.
- Límites comerciales comprobados en backend.

## Próximos pasos
- Completar UI específica FREE/BASE/PREMIUM.
- Separar completamente visualización de Necesidades, Servicios y Anuncios.
- Panel de administración de moderación.
- Reputación multidimensional y comentarios verificados.
- Íconos PWA reales.
- Pasarela de pago real cuando exista una integrable desde Cuba.

## Licencia
MIT
