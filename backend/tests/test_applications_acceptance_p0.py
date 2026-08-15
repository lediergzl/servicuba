from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.application import AppStatus
from app.models.task import TaskStatus
from app.routers import applications


class Query:
    def __init__(self, first_value=None, all_value=None):
        self.first_value = first_value
        self.all_value = all_value if all_value is not None else []

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self.first_value

    def all(self):
        return self.all_value


class DB:
    def __init__(self, app_ref, task, app, others):
        self.responses = {
            applications.Application: [
                Query(first_value=app_ref),
                Query(first_value=app),
                Query(all_value=others),
            ],
            applications.Task: [Query(first_value=task)],
        }
        self.commits = 0

    def query(self, model):
        return self.responses[model].pop(0)

    def commit(self):
        self.commits += 1


def fixture():
    task = SimpleNamespace(
        id="task-1",
        cliente_id="client",
        estado=TaskStatus.ACTIVA,
        tipo="necesidad",
        titulo="Reparación",
    )
    accepted = SimpleNamespace(
        id="app-1",
        task_id="task-1",
        worker_id="worker-1",
        estado=AppStatus.PENDIENTE,
    )
    other = SimpleNamespace(
        id="app-2",
        task_id="task-1",
        worker_id="worker-2",
        estado=AppStatus.PENDIENTE,
    )
    return task, accepted, other


def test_acceptance_assigns_task_and_rejects_other_pending(monkeypatch):
    task, accepted, other = fixture()
    db = DB(accepted, task, accepted, [other])
    notifications = []
    monkeypatch.setattr(
        applications,
        "send_push_to_user",
        lambda *args, **kwargs: notifications.append(args[1]),
    )

    result = applications.accept_application(
        "app-1", db=db, current_user=SimpleNamespace(id="client", nombre="Cliente")
    )

    assert result["message"] == "Solicitud aceptada correctamente"
    assert accepted.estado == AppStatus.ACEPTADA
    assert other.estado == AppStatus.RECHAZADA
    assert task.estado == TaskStatus.ASIGNADA
    assert db.commits == 1
    assert notifications == ["worker-2", "worker-1"]


def test_acceptance_requires_task_owner():
    task, accepted, other = fixture()
    db = DB(accepted, task, accepted, [other])

    with pytest.raises(HTTPException) as exc:
        applications.accept_application(
            "app-1", db=db, current_user=SimpleNamespace(id="outsider", nombre="X")
        )

    assert exc.value.status_code == 403
    assert task.estado == TaskStatus.ACTIVA
    assert accepted.estado == AppStatus.PENDIENTE
    assert db.commits == 0


def test_acceptance_rejects_when_task_is_no_longer_active():
    task, accepted, other = fixture()
    task.estado = TaskStatus.ASIGNADA
    db = DB(accepted, task, accepted, [other])

    with pytest.raises(HTTPException) as exc:
        applications.accept_application(
            "app-1", db=db, current_user=SimpleNamespace(id="client", nombre="Cliente")
        )

    assert exc.value.status_code == 400
    assert accepted.estado == AppStatus.PENDIENTE
    assert db.commits == 0
