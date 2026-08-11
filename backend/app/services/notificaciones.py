"""Avisos push de "nueva tarea cercana" a trabajadores — beneficio
"prioridad en notificaciones" del plan Pro (ver services/plans.py):
Premium se avisa al instante, plan gratis PUSH_PRIORIDAD_PREMIUM_MINUTOS
más tarde.

El envío inmediato (Premium) es una llamada síncrona más, igual que el
resto de los push de la app (ver routers/applications.py). El envío
retrasado (gratis) NO se resuelve con un `asyncio.sleep` en memoria: se
encola como una fila en `pending_notifications` (ver
models/pending_notification.py) que el loop de background de main.py
revisa cada minuto — así un redeploy/reinicio de Render durante la
espera no pierde el aviso.

No usa PostGIS para "cercanos" (a diferencia de tasks/nearby): la
ubicación de un TRABAJADOR vive en User.lat/User.lng (columnas float
simples, pobladas por PUT /users/activar-trabajador) — User.ubicacion
(la columna Geometry) nunca se llegó a popular en ese endpoint, así que
habría que castear una columna que siempre está vacía. Con la cantidad
de trabajadores esperable en esta app, un haversine en Python por
categoría es más que suficiente y evita esa columna muerta por ahora."""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models.task import Task, TaskStatus
from ..models.user import User
from ..models.pending_notification import PendingNotification
from .geo import haversine_distance
from .plans import (
    is_premium_active,
    PLAN_GRATIS_RADIO_MAX_KM,
    PLAN_PREMIUM_RADIO_MAX_KM,
    PUSH_PRIORIDAD_PREMIUM_MINUTOS,
)
from .push_service import send_push_to_user


def notificar_nuevos_trabajadores_cercanos(db: Session, task: Task, lat: float, lng: float):
    """Se llama justo después de crear una tarea (ver routers/tasks.py,
    create_task). `lat`/`lng` se reciben tal cual los mandó el cliente al
    publicarla, en vez de re-extraerlos de `task.ubicacion` — ya están a
    mano en el mismo request, no hace falta un cast/consulta PostGIS
    extra sólo para esto."""
    candidatos = (
        db.query(User)
        .filter(
            User.es_trabajador == True,  # noqa: E712
            User.categoria_id == task.categoria_id,
            User.lat.isnot(None),
            User.lng.isnot(None),
        )
        .all()
    )
    if not candidatos:
        return

    enviar_en_retraso = datetime.utcnow() + timedelta(minutes=PUSH_PRIORIDAD_PREMIUM_MINUTOS)
    hubo_retrasados = False

    for worker in candidatos:
        premium = is_premium_active(worker)
        # Mismo radio que el trabajador vería si buscara "a mano" en
        # Tareas cercanas — no tendría sentido avisarle de algo que su
        # propio plan no le dejaría ver.
        radio_km = PLAN_PREMIUM_RADIO_MAX_KM if premium else PLAN_GRATIS_RADIO_MAX_KM
        distancia = haversine_distance(lat, lng, worker.lat, worker.lng)
        if distancia > radio_km:
            continue

        if premium:
            send_push_to_user(
                db, worker.id,
                title="Nueva tarea cerca de ti ⭐",
                body=f"\"{task.titulo}\" — postúlate antes que nadie",
                url=f"/?task={task.id}",
            )
        else:
            db.add(PendingNotification(
                worker_id=worker.id,
                task_id=task.id,
                titulo="Nueva tarea cerca de ti",
                cuerpo=f"\"{task.titulo}\"",
                url=f"/?task={task.id}",
                enviar_en=enviar_en_retraso,
            ))
            hubo_retrasados = True

    if hubo_retrasados:
        db.commit()


def procesar_notificaciones_pendientes(db: Session):
    """Llamado por el loop de background cada minuto (ver main.py). Manda
    cualquier aviso cuyo `enviar_en` ya pasó. Si el proceso estuvo caído
    justo en ese momento, sale apenas el server vuelve a arrancar en vez
    de perderse — a costa de llegar algo tarde ese caso puntual."""
    ahora = datetime.utcnow()
    pendientes = (
        db.query(PendingNotification)
        .filter(
            PendingNotification.enviado == False,  # noqa: E712
            PendingNotification.enviar_en <= ahora,
        )
        .limit(200)  # cota defensiva: si se acumulara un lote enorme, se reparte en varias pasadas del loop
        .all()
    )
    if not pendientes:
        return

    # Una sola consulta para saber qué tareas siguen activas, en vez de
    # una por aviso — si una tarea ya se asignó/canceló mientras se
    # esperaba, no tiene sentido avisar "hay una tarea nueva" para algo
    # que ya no está disponible.
    task_ids = {p.task_id for p in pendientes}
    tareas_activas = {
        row.id
        for row in db.query(Task.id)
        .filter(Task.id.in_(task_ids), Task.estado == TaskStatus.ACTIVA)
        .all()
    }

    for aviso in pendientes:
        if aviso.task_id in tareas_activas:
            send_push_to_user(db, aviso.worker_id, title=aviso.titulo, body=aviso.cuerpo, url=aviso.url)
        aviso.enviado = True  # se marca igual aunque ya no esté activa, para no reintentar por siempre

    db.commit()
