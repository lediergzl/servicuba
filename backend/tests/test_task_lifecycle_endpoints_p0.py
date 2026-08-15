"""P0 endpoint contract tests for the complete task lifecycle."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.application import AppStatus
from app.models.task import TaskStatus
from app.routers import tasks


class Query:
    def __init__(self, value):
        self.value = value
    def filter(self, *args, **kwargs): return self
    def with_for_update(self): return self
    def first(self): return self.value


class DB:
    def __init__(self, task, app):
        self.task, self.app = task, app
        self.commits = 0
    def query(self, model):
        if model is tasks.Task:
            return Query(self.task)
        if model is tasks.Application:
            return Query(self.app)
        return Query(None)
    def commit(self): self.commits += 1
    def refresh(self, obj): pass


def make_db(state=TaskStatus.ASIGNADA):
    task = SimpleNamespace(estado=state, cliente_id="client", tipo="necesidad")
    app = SimpleNamespace(estado=AppStatus.ACEPTADA, worker_id="worker")
    return DB(task, app), task, app


def test_start_requires_assigned_worker():
    db, task, _ = make_db()
    with pytest.raises(HTTPException) as exc:
        tasks.start_task("t1", db=db, current_user=SimpleNamespace(id="outsider"))
    assert exc.value.status_code == 403
    assert task.estado == TaskStatus.ASIGNADA


def test_start_moves_assigned_worker_to_in_process():
    db, task, _ = make_db()
    result = tasks.start_task("t1", db=db, current_user=SimpleNamespace(id="worker"))
    assert task.estado == TaskStatus.EN_PROCESO
    assert result["estado"] == "en_proceso"


def test_complete_requires_worker_and_moves_to_completed():
    db, task, _ = make_db(TaskStatus.EN_PROCESO)
    result = tasks.complete_task_lifecycle("t1", db=db, current_user=SimpleNamespace(id="worker"))
    assert task.estado == TaskStatus.COMPLETADA
    assert result["estado"] == "completada"


def test_confirm_requires_client_and_closes_task():
    db, task, _ = make_db(TaskStatus.COMPLETADA)
    result = tasks.confirm_task("t1", db=db, current_user=SimpleNamespace(id="client"))
    assert task.estado == TaskStatus.CONFIRMADA
    assert result["estado"] == "confirmada"


@pytest.mark.parametrize("endpoint,state,actor", [
    (tasks.start_task, TaskStatus.CONFIRMADA, "worker"),
    (tasks.complete_task_lifecycle, TaskStatus.CONFIRMADA, "worker"),
    (tasks.confirm_task, TaskStatus.CONFIRMADA, "client"),
])
def test_terminal_confirmed_task_rejects_lifecycle_actions(endpoint, state, actor):
    db, task, _ = make_db(state)
    with pytest.raises(HTTPException) as exc:
        endpoint("t1", db=db, current_user=SimpleNamespace(id=actor))
    assert exc.value.status_code == 409
    assert task.estado == TaskStatus.CONFIRMADA


def test_completed_task_cannot_be_cancelled():
    db, task, _ = make_db(TaskStatus.COMPLETADA)
    with pytest.raises(HTTPException) as exc:
        tasks.cancel_task_lifecycle("t1", db=db, current_user=SimpleNamespace(id="client"))
    assert exc.value.status_code == 409
    assert task.estado == TaskStatus.COMPLETADA
