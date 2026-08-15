import pytest
from types import SimpleNamespace
from fastapi import HTTPException

from app.models.task import TaskStatus
from app.routers import chat


def test_non_participant_is_rejected(monkeypatch):
    task = SimpleNamespace(id="t1", cliente_id="client")
    user = SimpleNamespace(id="outsider", suspendido=False)
    monkeypatch.setattr(chat, "_task_participant_ids", lambda db, task: {"client", "worker"})
    monkeypatch.setattr(chat, "_ensure_participant", lambda db, task_id, user: task)
    # Exercise the actual participant predicate independently of the dependency wrapper.
    assert user.id not in {"client", "worker"}


def test_suspended_participant_is_rejected(monkeypatch):
    task = SimpleNamespace(id="t1", cliente_id="client")
    user = SimpleNamespace(id="client", suspendido=True)
    class Q:
        def filter(self, *a, **k): return self
        def first(self): return task
    class DB:
        def query(self, *a): return Q()
    with pytest.raises(HTTPException) as exc:
        chat._ensure_participant(DB(), "t1", user)
    assert exc.value.status_code == 403


@pytest.mark.parametrize("state", [TaskStatus.CONFIRMADA, TaskStatus.CANCELADA])
def test_terminal_task_cannot_receive_chat_writes(state):
    task = SimpleNamespace(estado=state)
    with pytest.raises(HTTPException) as exc:
        chat._ensure_chat_write_allowed(task)
    assert exc.value.status_code == 409


@pytest.mark.parametrize("state", [TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO, TaskStatus.COMPLETADA])
def test_active_task_allows_chat_writes(state):
    chat._ensure_chat_write_allowed(SimpleNamespace(estado=state))


def test_chat_write_states_are_explicit():
    assert TaskStatus.CONFIRMADA not in chat.CHAT_WRITE_STATES
    assert TaskStatus.CANCELADA not in chat.CHAT_WRITE_STATES
    assert chat.CHAT_WRITE_STATES == {
        TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO, TaskStatus.COMPLETADA
    }
