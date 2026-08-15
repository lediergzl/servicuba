from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models.payment import PaymentStatus, PaymentType
from app.models.user import UserPlan
from app.routers import payments


class Query:
    def __init__(self, rows=(), first_value=None):
        self.rows = list(rows)
        self.first_value = first_value
    def filter(self, *args, **kwargs):
        return self
    def with_for_update(self):
        return self
    def all(self):
        return self.rows
    def first(self):
        return self.first_value


class DB:
    def __init__(self, payment, user, other_expiries):
        self.payment = payment
        self.user = user
        self.other_expiries = other_expiries
        self.commits = 0
    def query(self, model):
        if model is payments.Payment.entitlement_expires_at:
            return Query(rows=[(expiry,) for expiry in self.other_expiries])
        return Query()
    def commit(self):
        self.commits += 1
    def refresh(self, obj):
        pass


def test_refund_one_premium_payment_keeps_later_entitlement(monkeypatch):
    now = datetime.utcnow()
    later = now + timedelta(days=20)
    user = SimpleNamespace(id="u1", plan=UserPlan.PREMIUM, plan_expira=later)
    payment = SimpleNamespace(
        id="p1", user_id="u1", tipo=PaymentType.SUSCRIPCION_TRABAJADOR,
        estado=PaymentStatus.CONFIRMADO, entitlement_expires_at=now + timedelta(days=10),
        confirmed_at=None,
    )
    db = DB(payment, user, [later])
    monkeypatch.setattr(payments, "_get_locked_payment", lambda _db, _id: payment)
    monkeypatch.setattr(payments, "_lock_user", lambda _db, _id: user)
    monkeypatch.setattr(payments, "_audit", lambda *args, **kwargs: None)

    payments.refund_payment("p1", db=db, admin=SimpleNamespace(id="admin"))

    assert payment.estado == PaymentStatus.REEMBOLSADO
    assert user.plan == UserPlan.PREMIUM
    assert user.plan_expira == later


def test_refund_only_premium_payment_revokes_entitlement(monkeypatch):
    now = datetime.utcnow()
    user = SimpleNamespace(id="u1", plan=UserPlan.PREMIUM, plan_expira=now + timedelta(days=10))
    payment = SimpleNamespace(
        id="p1", user_id="u1", tipo=PaymentType.SUSCRIPCION_TRABAJADOR,
        estado=PaymentStatus.CONFIRMADO, entitlement_expires_at=now + timedelta(days=10),
        confirmed_at=None,
    )
    db = DB(payment, user, [])
    monkeypatch.setattr(payments, "_get_locked_payment", lambda _db, _id: payment)
    monkeypatch.setattr(payments, "_lock_user", lambda _db, _id: user)
    monkeypatch.setattr(payments, "_audit", lambda *args, **kwargs: None)

    payments.refund_payment("p1", db=db, admin=SimpleNamespace(id="admin"))

    assert payment.estado == PaymentStatus.REEMBOLSADO
    assert user.plan == UserPlan.GRATIS
    assert user.plan_expira is None
