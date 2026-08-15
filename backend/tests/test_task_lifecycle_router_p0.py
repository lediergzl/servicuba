"""P0 tests for the actual /api/tasks/{task_id}/ lifecycle router."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.application import AppStatus
from app.models.task import TaskStatus
from app.routers import task_lifecycle


class Query:
    def __init__(self, value):
        self.value = value

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self.value


class DB:
    def __init__(self, task, app):
        self.task = task
        self.app = app
        self.commits = 0

    def query(self, model):
        if model is task_lifecycle.Task:
            return Query(self.task)
        if model is task_lifecycle.Application:
            return Query(self.app)
        return Query(None)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def fixture(state=TaskStatus.ASIGNADA, tipo="necesidad"):
    task = SimpleNamespace(
        id="task-1",
        tipo=tipo,
        cliente_id="client",
        estado=state,
    )
    app = SimpleNamespace(
        task_id="task-1",
        worker_id="worker",
        estado=AppStatus.ACEPTADA,
    )
    return DB(task, app), task, app


def test_real_start_endpoint_requires_assigned_worker():
    db, task, _ = fixture()
    with pytest.raises(HTTPException) as exc:
        task_lifecycle.start_task("task-1", db=db, current_user=SimpleNamespace(id="other"))
    assert exc.value.status_code == 403
    assert task.estado == TaskStatus.ASIGNADA
    assert db.commits == 0


def test_real_start_endpoint_transitions_worker():
    db, task, _ = fixture()
    result = task_lifecycle.start_task("task-1", db=db, current_user=SimpleNamespace(id="worker"))
    assert task.estado == TaskStatus.EN_PROCESO
    assert result["estado"] == "en_proceso"
    assert db.commits == 1


def test_real_complete_endpoint_is_worker_only():
    db, task, _ = fixture(TaskStatus.EN_PROCESO)
    with pytest.raises(HTTPException) as exc:
        task_lifecycle.complete_task_lifecycle("task-1", db=db, current_user=SimpleNamespace(id="client"))
    assert exc.value.status_code == 403
    assert task.estado == TaskStatus.EN_PROCESO


def test_real_complete_endpoint_then_client_can_confirm():
    db, task, _ = fixture(TaskStatus.EN_PROCESO)
    result = task_lifecycle.complete_task_lifecycle(
        "task-1", db=db, current_user=SimpleNamespace(id="worker")
    )
    assert result["estado"] == "completada"

    result = task_lifecycle.confirm_task(
        "task-1", db=db, current_user=SimpleNamespace(id="client")
    )
    assert result["estado"] == "confirmada"
    assert task.estado == TaskStatus.CONFIRMADA
    assert db.commits == 2


@pytest.mark.parametrize("state", [TaskStatus.CONFIRMADA, TaskStatus.CANCELADA])
def test_real_terminal_states_reject_lifecycle_actions(state):
    db, task, _ = fixture(state)
    with pytest.raises(HTTPException) as exc:
        task_lifecycle.start_task("task-1", db=db, current_user=SimpleNamespace(id="worker"))
    assert exc.value.status_code == 409
    assert task.estado == state


def test_real_cancel_endpoint_allows_participant_before_confirmation():
    db, task, _ = fixture(TaskStatus.EN_PROCESO)
    result = task_lifecycle.cancel_task_lifecycle(
        "task-1", db=db, current_user=SimpleNamespace(id="client")
    )
    assert result["estado"] == "cancelada"
    assert task.estado == TaskStatus.CANCELADA


def test_real_cancel_endpoint_rejects_outsider():
    db, task, _ = fixture(TaskStatus.EN_PROCESO)
    with pytest.raises(HTTPException) as exc:
        task_lifecycle.cancel_task_lifecycle(
            "task-1", db=db, current_user=SimpleNamespace(id="outsider")
        )
    assert exc.value.status_code == 403
    assert task.estado == TaskStatus.EN_PROCESO


def test_real_offer_flow_maps_publisher_as_worker_and_applicant_as_client():
    db, task, app = fixture(TaskStatus.ASIGNADA, tipo="oferta")
    result = task_lifecycle.start_task(
        "task-1", db=db, current_user=SimpleNamespace(id="client")
    )
    assert result["estado"] == "en_proceso"

    result = task_lifecycle.complete_task_lifecycle(
        "task-1", db=db, current_user=SimpleNamespace(id="client")
    )
    assert result["estado"] == "completada"

    result = task_lifecycle.confirm_task(
        "task-1", db=db, current_user=SimpleNamespace(id="worker")
    )
    assert result["estado"] == "confirmada"
