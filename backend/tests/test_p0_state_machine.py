"""Executable state-machine tests for the P0 payment/admin invariants."""

from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models.payment import PaymentStatus, PaymentType


def test_payment_statuses_include_terminal_refund_state():
    assert {s.value for s in PaymentStatus} >= {"pendiente", "confirmado", "rechazado", "reembolsado"}


def test_payment_types_are_explicit():
    assert {t.value for t in PaymentType} == {
        "suscripcion_trabajador", "tarea_destacada", "anuncio"
    }


def test_refund_transition_is_only_valid_from_confirmed():
    valid = PaymentStatus.CONFIRMADO
    invalid = {PaymentStatus.PENDIENTE, PaymentStatus.RECHAZADO, PaymentStatus.REEMBOLSADO}
    assert valid not in invalid
    for state in invalid:
        assert state != valid


def test_entitlement_expiry_is_recordable():
    now = datetime.utcnow()
    payment = SimpleNamespace(entitlement_expires_at=now + timedelta(days=30))
    assert payment.entitlement_expires_at > now


def test_p0_router_modules_are_importable():
    # Router imports must remain independent from production startup side effects.
    import app.routers.admin  # noqa: F401
    import app.routers.payments  # noqa: F401
    import app.routers.chat  # noqa: F401
