from datetime import datetime, timedelta
from types import SimpleNamespace

from backend.app.services.task_priority import (
    BEST_OPPORTUNITY_PRIORITY_MINUTES,
    NORMAL_PRIORITY_MINUTES,
    has_priority_access,
    is_best_opportunity,
    priority_release_at,
)


def task(price=500, created_at=None, destacada=False, destacada_hasta=None):
    return SimpleNamespace(
        precio=price,
        created_at=created_at or datetime.utcnow(),
        destacada=destacada,
        destacada_hasta=destacada_hasta,
    )


def test_normal_task_has_ten_minute_window():
    now = datetime.utcnow()
    t = task(created_at=now)
    assert not is_best_opportunity(t, now)
    assert priority_release_at(t, now) == now + timedelta(minutes=NORMAL_PRIORITY_MINUTES)


def test_high_budget_task_has_extended_window():
    now = datetime.utcnow()
    t = task(price=2000, created_at=now)
    assert is_best_opportunity(t, now)
    assert priority_release_at(t, now) == now + timedelta(minutes=BEST_OPPORTUNITY_PRIORITY_MINUTES)


def test_non_premium_cannot_access_before_release(monkeypatch):
    from backend.app.services import task_priority
    now = datetime.utcnow()
    t = task(created_at=now)
    worker = SimpleNamespace(plan="BASE", plan_expira=None)
    monkeypatch.setattr(task_priority, "is_premium_active", lambda user: False)
    assert not has_priority_access(worker, t, now + timedelta(minutes=5))
    assert has_priority_access(worker, t, now + timedelta(minutes=10))


def test_premium_has_immediate_access(monkeypatch):
    from backend.app.services import task_priority
    now = datetime.utcnow()
    t = task(created_at=now)
    worker = SimpleNamespace(plan="PREMIUM", plan_expira=now + timedelta(days=30))
    monkeypatch.setattr(task_priority, "is_premium_active", lambda user: True)
    assert has_priority_access(worker, t, now)
