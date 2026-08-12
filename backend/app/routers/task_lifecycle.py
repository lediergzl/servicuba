from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.application import Application, AppStatus
from ..models.task import Task, TaskStatus
from ..models.user import User
from ..services.auth import get_current_user
from ..services.task_lifecycle import LifecycleAction, TaskLifecycleError, transition

router = APIRouter()


def _locked_task(db: Session, task_id: UUID) -> Task:
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if not task:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    return task


def _accepted_application(db: Session, task_id: UUID) -> Application:
    app = (
        db.query(Application)
        .filter(Application.task_id == task_id, Application.estado == AppStatus.ACEPTADA)
        .with_for_update()
        .first()
    )
    if not app:
        raise HTTPException(status_code=409, detail="La publicación no tiene una solicitud aceptada")
    return app


def _perform_transition(db: Session, task: Task, action: LifecycleAction) -> None:
    try:
        task.estado = TaskStatus(transition(task.estado.value, action))
    except (TaskLifecycleError, ValueError):
        raise HTTPException(
            status_code=409,
            detail=f"No se puede ejecutar '{action.value}' cuando la publicación está en '{task.estado.value}'",
        )


@router.post("/{task_id}/start")
def start_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El participante responsable del trabajo inicia una tarea asignada."""
    task = _locked_task(db, task_id)
    app = _accepted_application(db, task_id)

    # necesidad: worker accepted app starts the work.
    # oferta: publisher (worker) is the one providing the service.
    worker_id = app.worker_id if task.tipo != "oferta" else task.cliente_id
    if worker_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sólo el trabajador asignado puede iniciar el servicio")

    _perform_transition(db, task, LifecycleAction.START)
    db.commit()
    db.refresh(task)
    return {"message": "Servicio iniciado", "estado": task.estado.value}


@router.post("/{task_id}/complete")
def complete_task_lifecycle(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El trabajador declara terminado el servicio; el cliente aún debe confirmar."""
    task = _locked_task(db, task_id)
    app = _accepted_application(db, task_id)
    worker_id = app.worker_id if task.tipo != "oferta" else task.cliente_id
    if worker_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sólo el trabajador responsable puede finalizar el servicio")

    _perform_transition(db, task, LifecycleAction.COMPLETE)
    db.commit()
    db.refresh(task)
    return {"message": "Servicio marcado como completado; queda pendiente la confirmación del cliente", "estado": task.estado.value}


@router.post("/{task_id}/confirm")
def confirm_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El cliente confirma que recibió el servicio y cierra el contrato."""
    task = _locked_task(db, task_id)
    app = _accepted_application(db, task_id)

    # necesidad: task owner is client.
    # oferta: accepted applicant is client.
    client_id = task.cliente_id if task.tipo != "oferta" else app.worker_id
    if client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sólo el cliente puede confirmar el servicio")

    _perform_transition(db, task, LifecycleAction.CONFIRM)
    db.commit()
    db.refresh(task)
    return {"message": "Servicio confirmado correctamente", "estado": task.estado.value}


@router.post("/{task_id}/cancel")
def cancel_task_lifecycle(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cualquiera de las partes puede cancelar antes de la confirmación final."""
    task = _locked_task(db, task_id)
    app = None
    if task.estado in (TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO, TaskStatus.COMPLETADA):
        # A completed task is deliberately excluded below; keep this lookup
        # only for the participant checks on cancellable assigned/in-process tasks.
        app = _accepted_application(db, task_id)

    if task.estado == TaskStatus.ACTIVA:
        if task.cliente_id != current_user.id:
            raise HTTPException(status_code=403, detail="Sólo el publicador puede cancelar una publicación activa")
    elif task.estado in (TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO):
        assert app is not None
        participants = {task.cliente_id, app.worker_id}
        if current_user.id not in participants:
            raise HTTPException(status_code=403, detail="No formas parte de este servicio")
    else:
        # COMPLETADA is intentionally not cancellable: it is waiting for
        # client confirmation and must be resolved through confirm/dispute.
        raise HTTPException(status_code=409, detail="El servicio ya fue completado y no puede cancelarse")

    _perform_transition(db, task, LifecycleAction.CANCEL)
    db.commit()
    db.refresh(task)
    return {"message": "Servicio cancelado", "estado": task.estado.value}
