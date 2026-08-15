"""P0 integration-boundary tests for lifecycle/chat invariants."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.task import TaskStatus
from app.routers.chat import CHAT_WRITE_STATES, _ensure_chat_write_allowed


@pytest.mark.parametrize("terminal", [TaskStatus.CONFIRMADA, TaskStatus.CANCELADA])
def test_terminal_lifecycle_state_closes_chat_writes(terminal):
    task = SimpleNamespace(estado=terminal)
    with pytest.raises(HTTPException) as exc:
        _ensure_chat_write_allowed(task)
    assert exc.value.status_code == 409


def test_chat_write_state_is_subset_of_non_terminal_service_states():
    assert CHAT_WRITE_STATES == {
        TaskStatus.ASIGNADA,
        TaskStatus.EN_PROCESO,
        TaskStatus.COMPLETADA,
    }
    assert TaskStatus.CONFIRMADA not in CHAT_WRITE_STATES
    assert TaskStatus.CANCELADA not in CHAT_WRITE_STATES


def test_websocket_must_recheck_task_state_before_each_write():
    source = __import__("inspect").getsource(__import__("app.routers.chat", fromlist=["chat"]).chat_websocket)
    assert "receive_json" in source
    assert "db.query(Task).filter(Task.id == task_id).first()" in source
    assert "task.estado not in CHAT_WRITE_STATES" in source
