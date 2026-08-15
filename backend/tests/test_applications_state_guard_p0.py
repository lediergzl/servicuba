from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.application import AppStatus
from app.models.task import TaskStatus
from app.routers import applications


class Query:
    def __init__(self, value): self.value = value
    def filter(self, *args, **kwargs): return self
    def with_for_update(self): return self
    def first(self): return self.value
    def all(self): return self.value if isinstance(self.value, list) else []
    def count(self): return 0


class DB:
    def __init__(self, task, app): self.task, self.app = task, app
    def query(self, model):
        if model is applications.Task: return Query(self.task)
        if model is applications.Application: return Query(self.app)
        return Query(None)
    def add(self, obj): pass
    def commit(self): pass
    def refresh(self, obj): pass


def test_acceptance_rejects_non_owner():
    task = SimpleNamespace(id="t1", cliente_id="owner", estado=TaskStatus.ACTIVA)
    app = SimpleNamespace(id="a1", task_id="t1", estado=AppStatus.PENDIENTE)
    db = DB(task, app)
    with pytest.raises(HTTPException) as exc:
        applications.accept_application("a1", db=db, current_user=SimpleNamespace(id="other"))
    assert exc.value.status_code == 403


def test_acceptance_rejects_inactive_task():
    task = SimpleNamespace(id="t1", cliente_id="owner", estado=TaskStatus.ASIGNADA)
    app = SimpleNamespace(id="a1", task_id="t1", estado=AppStatus.PENDIENTE)
    db = DB(task, app)
    with pytest.raises(HTTPException) as exc:
        applications.accept_application("a1", db=db, current_user=SimpleNamespace(id="owner"))
    assert exc.value.status_code == 400


def test_acceptance_rejects_already_processed_application():
    task = SimpleNamespace(id="t1", cliente_id="owner", estado=TaskStatus.ACTIVA)
    app = SimpleNamespace(id="a1", task_id="t1", estado=AppStatus.ACEPTADA)
    db = DB(task, app)
    with pytest.raises(HTTPException) as exc:
        applications.accept_application("a1", db=db, current_user=SimpleNamespace(id="owner"))
    assert exc.value.status_code == 400
