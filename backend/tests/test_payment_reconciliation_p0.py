from types import SimpleNamespace

from app.models.payment import PaymentStatus, PaymentType
from app.routers.admin import payment_reconciliation


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return self.rows


class FakeDB:
    def __init__(self, rows):
        self.rows = rows

    def query(self, model):
        return FakeQuery(self.rows)


def payment(amount, status, kind=PaymentType.ANUNCIO, currency="USD"):
    return SimpleNamespace(
        monto=amount,
        estado=status,
        tipo=kind,
        moneda=currency,
        created_at=None,
    )


def test_reconciliation_keeps_refunds_in_gross_and_reduces_net():
    db = FakeDB([
        payment(10, PaymentStatus.CONFIRMADO),
        payment(5, PaymentStatus.REEMBOLSADO),
        payment(7, PaymentStatus.PENDIENTE),
        payment(3, PaymentStatus.RECHAZADO),
    ])

    result = payment_reconciliation(db=db, _admin=SimpleNamespace(id="admin"))

    assert result["pagos_considerados"] == 4
    assert result["resumen"]["USD"] == {
        "cantidad": 4,
        "confirmado_bruto": "15.00",
        "reembolsado": "5.00",
        "neto": "10.00",
        "pendiente": "7.00",
        "rechazado": "3.00",
    }
    assert result["conteos"] == {
        "pendiente": 1,
        "confirmado": 1,
        "rechazado": 1,
        "reembolsado": 1,
    }


def test_reconciliation_breaks_down_by_type_and_currency():
    db = FakeDB([
        payment(10, PaymentStatus.CONFIRMADO, PaymentType.SUSCRIPCION_TRABAJADOR, "USD"),
        payment(4, PaymentStatus.REEMBOLSADO, PaymentType.SUSCRIPCION_TRABAJADOR, "USD"),
        payment(8, PaymentStatus.CONFIRMADO, PaymentType.TAREA_DESTACADA, "CUP"),
    ])

    result = payment_reconciliation(db=db, _admin=SimpleNamespace(id="admin"))

    assert result["por_tipo"]["suscripcion_trabajador"]["USD"]["confirmado_bruto"] == "14.00"
    assert result["por_tipo"]["suscripcion_trabajador"]["USD"]["reembolsado"] == "4.00"
    assert result["por_tipo"]["suscripcion_trabajador"]["USD"]["neto"] == "10.00"
    assert result["por_moneda"]["USD"]["confirmado_bruto"] == "14.00"
    assert result["por_moneda"]["USD"]["reembolsado"] == "4.00"
    assert result["por_moneda"]["USD"]["neto"] == "10.00"
    assert result["por_moneda"]["CUP"]["neto"] == "8.00"
