"""Behavioral P0 tests using isolated fakes; no production DB is touched."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.payment import PaymentStatus, PaymentType
from app.services import auth
from app.services.auth import get_current_admin, get_current_user
from app.routers import payments


class FakeQuery:
    def __init__(self, value):
        self.value = value

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self.value


class FakeDB:
    def __init__(self, value=None):
        self.value = value
        self.audit = []
        self.commits = 0
        self.rollbacks = 0

    def query(self, model):
        return FakeQuery(self.value)

    def add(self, value):
        self.audit.append(value)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def refresh(self, value):
        pass


def test_suspended_user_is_rejected_by_auth(monkeypatch):
    user = SimpleNamespace(id="u1", suspendido=True)
    db = FakeDB(user)
    monkeypatch.setattr(auth, "decode_token", lambda token: {"sub": "u1"})

    with pytest.raises(HTTPException) as exc:
        get_current_user(token="unused", db=db)
    assert exc.value.status_code == 403


def test_invalid_token_is_rejected_by_auth(monkeypatch):
    monkeypatch.setattr(auth, "decode_token", lambda token: None)
    with pytest.raises(HTTPException) as exc:
        get_current_user(token="invalid", db=FakeDB())
    assert exc.value.status_code == 401


def test_admin_guard_rejects_non_admin():
    user = SimpleNamespace(es_admin=False)
    with pytest.raises(HTTPException) as exc:
        get_current_admin(user)
    assert exc.value.status_code == 403


def test_admin_guard_accepts_admin():
    user = SimpleNamespace(es_admin=True)
    assert get_current_admin(user) is user


def test_refund_is_idempotent_and_terminal(monkeypatch):
    payment = SimpleNamespace(
        id="p1",
        tipo=PaymentType.ANUNCIO,
        estado=PaymentStatus.CONFIRMADO,
        notas="original",
        confirmed_at=None,
    )
    db = FakeDB(payment)
    admin = SimpleNamespace(id="admin")

    monkeypatch.setattr(payments, "_get_locked_payment", lambda _db, _id: payment)
    monkeypatch.setattr(payments, "_audit", lambda db, admin, action, payment, details=None: db.audit.append(action))

    result = payments.refund_payment("p1", db=db, admin=admin)
    assert result.estado == PaymentStatus.REEMBOLSADO
    assert db.commits == 1
    assert "PAYMENT_REFUNDED" in db.audit

    with pytest.raises(HTTPException) as exc:
        payments.refund_payment("p1", db=db, admin=admin)
    assert exc.value.status_code == 400
    assert db.commits == 1


def test_reject_is_only_allowed_from_pending(monkeypatch):
    payment = SimpleNamespace(
        id="p2", tipo=PaymentType.ANUNCIO,
        estado=PaymentStatus.PENDIENTE, confirmed_at=None
    )
    db = FakeDB(payment)
    admin = SimpleNamespace(id="admin")
    monkeypatch.setattr(payments, "_get_locked_payment", lambda _db, _id: payment)
    monkeypatch.setattr(payments, "_audit", lambda *args, **kwargs: None)

    payments.reject_payment("p2", db=db, admin=admin)
    assert payment.estado == PaymentStatus.RECHAZADO

    with pytest.raises(HTTPException) as exc:
        payments.reject_payment("p2", db=db, admin=admin)
    assert exc.value.status_code == 400


def test_reject_rolls_back_when_commit_fails(monkeypatch):
    payment = SimpleNamespace(
        id="p3", tipo=PaymentType.ANUNCIO,
        estado=PaymentStatus.PENDIENTE, confirmed_at=None
    )
    db = FakeDB(payment)
    admin = SimpleNamespace(id="admin")
    monkeypatch.setattr(payments, "_get_locked_payment", lambda _db, _id: payment)
    monkeypatch.setattr(payments, "_audit", lambda *args, **kwargs: None)

    def failing_commit():
        db.commits += 1
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db, "commit", failing_commit)

    with pytest.raises(RuntimeError, match="commit failed"):
        payments.reject_payment("p3", db=db, admin=admin)

    assert db.commits == 1
    assert db.rollbacks == 1
