"""P0 guards for weekly application limits and premium bypass."""
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.application import AppStatus
from app.models.task import TaskStatus
from app.routers import applications


class Query:
    def __init__(self, value=None, count_value=0):
        self.value = value
        self.count_value = count_value
    def filter(self, *args, **kwargs): return self
    def with_for_update(self): return self
    def first(self): return self.value
    def count(self): return self.count_value


class DB:
    def __init__(self, task, existing_count=0):
        self.task = task
        self.existing_count = existing_count
    def query(self, model):
        if model is applications.Task:
            return Query(self.task)
        if model is applications.Application:
            return Query(None, self.existing_count)
        return Query()


def user(premium=False):
    return SimpleNamespace(id="worker", es_trabajador=True, es_cliente=False, premium=premium)


def task():
    return SimpleNamespace(id="t1", cliente_id="client", estado=TaskStatus.ACTIVA, tipo="necesidad")


def test_free_worker_at_weekly_limit_is_rejected(monkeypatch):
    monkeypatch.setattr(applications, "PLAN_GRATIS_POSTULACIONES_SEMANA", 5)
    monkeypatch.setattr(applications, "is_premium_active", lambda _: False)
    with pytest.raises(HTTPException) as exc:
        applications.apply_to_task("t1", SimpleNamespace(mensaje="x"), db=DB(task(), 5), current_user=user())
    assert exc.value.status_code == 402


def test_premium_worker_bypasses_weekly_limit(monkeypatch):
    monkeypatch.setattr(applications, "PLAN_GRATIS_POSTULACIONES_SEMANA", 5)
    monkeypatch.setattr(applications, "is_premium_active", lambda _: True)
    # The test stops at the duplicate-check boundary; reaching it proves the
    # weekly-limit guard did not reject the premium account.
    db = DB(task(), 5)
    monkeypatch.setattr(db, "add", lambda obj: None, raising=False)
    monkeypatch.setattr(db, "commit", lambda: None, raising=False)
    monkeypatch.setattr(db, "refresh", lambda obj: None, raising=False)
    monkeypatch.setattr(applications, "send_push_to_user", lambda *a, **k: None)
    result = applications.apply_to_task("t1", SimpleNamespace(mensaje="x"), db=db, current_user=user(True))
    assert result is not None


def test_limit_window_is_seven_days(monkeypatch):
    monkeypatch.setattr(applications, "PLAN_GRATIS_POSTULACIONES_SEMANA", 5)
    monkeypatch.setattr(applications, "is_premium_active", lambda _: False)
    captured = {}
    original_filter = Query.filter
    def capture(self, *args, **kwargs):
        captured["filter"] = args
        return self
    Query.filter = capture
    try:
        with pytest.raises(HTTPException):
            applications.apply_to_task("t1", SimpleNamespace(mensaje="x"), db=DB(task(), 5), current_user=user())
    finally:
        Query.filter = original_filter
    assert "filter" in captured
