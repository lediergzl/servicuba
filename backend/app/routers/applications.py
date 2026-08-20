from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from ..database import get_db
from ..models.application import Application, AppStatus
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..schemas.application import ApplicationCreate, ApplicationResponse
from ..services.auth import get_current_user
from ..services.push_service import send_push_to_user
from ..services.plans import is_premium_active, PLAN_GRATIS_POSTULACIONES_SEMANA
from ..services.task_priority import ensure_priority_access
from uuid import UUID

router = APIRouter()


@router.post("/{task_id}/apply", response_model=ApplicationResponse)
def apply_to_task(task_id: UUID, application: ApplicationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task or task.estado != TaskStatus.ACTIVA:
        raise HTTPException(status_code=404, detail="Publicación no disponible")

    if task.tipo == "oferta":
        if not current_user.es_cliente:
            raise HTTPException(status_code=403, detail="Activa tu perfil de cliente para solicitar este servicio")
    else:
        if not current_user.es_trabajador:
            raise HTTPException(status_code=403, detail="Activa tu perfil de trabajador para postularte (Perfil → Activar modo Trabajador)")
        # Barrera autoritativa: aunque un BASE conozca el ID o fuerce una
        # petición HTTP, no puede postularse durante la ventana PREMIUM.
        ensure_priority_access(current_user, task)
        if PLAN_GRATIS_POSTULACIONES_SEMANA is not None and not is_premium_active(current_user):
            hace_7_dias = datetime.utcnow() - timedelta(days=7)
            postulaciones_semana = db.query(Application).filter(Application.worker_id == current_user.id, Application.created_at >= hace_7_dias).count()
            if postulaciones_semana >= PLAN_GRATIS_POSTULACIONES_SEMANA:
                raise HTTPException(status_code=402, detail=f"Alcanzaste el límite de {PLAN_GRATIS_POSTULACIONES_SEMANA} postulaciones semanales del plan gratis. Hazte premium para postularte sin límite.")

    if task.cliente_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes postularte/solicitar tu propia publicación")
    existing = db.query(Application).filter(Application.task_id == task_id, Application.worker_id == current_user.id, Application.estado == AppStatus.PENDIENTE).first()
    if existing: raise HTTPException(status_code=400, detail="Ya hiciste esta solicitud")

    db_app = Application(task_id=task_id, worker_id=current_user.id, mensaje=application.mensaje, estado=AppStatus.PENDIENTE)
    db.add(db_app); db.commit(); db.refresh(db_app)
    if task.tipo == "oferta":
        send_push_to_user(db, task.cliente_id, title="Nueva solicitud", body=f"{current_user.nombre} quiere contratar tu servicio \"{task.titulo}\"", url=f"/?task={task_id}")
    else:
        send_push_to_user(db, task.cliente_id, title="Nueva postulación", body=f"{current_user.nombre} se postuló a \"{task.titulo}\"", url=f"/?task={task_id}")
    return db_app


@router.get("/mine")
def list_my_applications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Application.task_id).filter(Application.worker_id == current_user.id, Application.estado.in_([AppStatus.PENDIENTE, AppStatus.ACEPTADA])).all()
    return [str(r.task_id) for r in rows]


@router.get("/task/{task_id}")
def list_task_applications(task_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task=db.query(Task).filter(Task.id==task_id).first()
    if not task: raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if task.cliente_id!=current_user.id: raise HTTPException(status_code=403, detail="No eres el dueño de esta publicación")
    rows=db.query(Application,User).join(User,User.id==Application.worker_id).filter(Application.task_id==task_id,Application.estado==AppStatus.PENDIENTE).order_by(Application.created_at.asc()).all()
    return [{"id":str(app.id),"worker_id":str(worker.id),"worker_nombre":worker.nombre,"worker_rating":worker.rating or 0.0,"worker_verificado":worker.verificado,"mensaje":app.mensaje,"created_at":app.created_at.isoformat()} for app,worker in rows]


@router.post("/{application_id}/accept")
def accept_application(application_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    app_ref=db.query(Application).filter(Application.id==application_id).first()
    if not app_ref: raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    task=db.query(Task).filter(Task.id==app_ref.task_id).with_for_update().first()
    if not task: raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if task.cliente_id!=current_user.id: raise HTTPException(status_code=403, detail="No eres el dueño de esta publicación")
    if task.estado!=TaskStatus.ACTIVA: raise HTTPException(status_code=400, detail="Esta publicación ya no está activa")
    app=db.query(Application).filter(Application.id==application_id,Application.task_id==task.id).with_for_update().first()
    if not app: raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if app.estado!=AppStatus.PENDIENTE: raise HTTPException(status_code=400, detail="Esta solicitud ya no está pendiente")
    other_pending=db.query(Application).filter(Application.task_id==task.id,Application.id!=app.id,Application.estado==AppStatus.PENDIENTE).all()
    for other in other_pending: other.estado=AppStatus.RECHAZADA
    app.estado=AppStatus.ACEPTADA; task.estado=TaskStatus.ASIGNADA; db.commit()
    for other in other_pending: send_push_to_user(db,other.worker_id,title="Solicitud no seleccionada",body=f"La publicación \"{task.titulo}\" ya fue asignada a otra persona",url=f"/?task={task.id}")
    if task.tipo=="oferta": send_push_to_user(db,app.worker_id,title="¡Solicitud aceptada!",body=f"{current_user.nombre} aceptó tu solicitud para \"{task.titulo}\"",url=f"/?task={task.id}&view=chat")
    else: send_push_to_user(db,app.worker_id,title="¡Postulación aceptada!",body=f"Te asignaron \"{task.titulo}\"",url=f"/?task={task.id}&view=chat")
    return {"message":"Solicitud aceptada correctamente"}
