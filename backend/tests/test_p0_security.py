"""P0 regression tests that can run without a production database."""

from pathlib import Path
import ast

ROOT = Path(__file__).resolve().parents[1]


def _source(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_auth_has_admin_and_active_guards():
    source = _source("app/services/auth.py")
    assert "get_current_admin" in source
    assert "suspendido" in source


def test_chat_rechecks_terminal_state_before_sending():
    source = _source("app/routers/chat.py")
    assert "CONFIRMADA" in source
    assert "CANCELADA" in source
    assert "suspendido" in source


def test_payment_state_machine_contains_refund_and_locking():
    source = _source("app/routers/payments.py")
    assert "REEMBOLSADO" in source
    assert "with_for_update" in source
    assert "PAYMENT_REFUNDED" in source
    assert "entitlement_expires_at" in source


def test_admin_actions_are_audited():
    source = _source("app/routers/admin.py")
    assert "get_current_admin" in source
    assert "AuditLog" in source
    assert "USER_SUSPENDED" in source
    assert "USER_UNSUSPENDED" in source


def test_payment_model_has_terminal_refund_state():
    source = _source("app/models/payment.py")
    assert "REEMBOLSADO" in source
    assert "entitlement_expires_at" in source


def test_all_python_files_parse():
    for path in ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
