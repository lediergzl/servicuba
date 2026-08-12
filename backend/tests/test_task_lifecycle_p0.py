import pytest

from app.services.task_lifecycle import LifecycleAction, TaskLifecycleError, can_transition, transition


@pytest.mark.parametrize("state, action, expected", [
    ("activa", LifecycleAction.ACCEPT, "asignada"),
    ("asignada", LifecycleAction.START, "en_proceso"),
    ("en_proceso", LifecycleAction.COMPLETE, "completada"),
    ("completada", LifecycleAction.CONFIRM, "confirmada"),
    ("activa", LifecycleAction.CANCEL, "cancelada"),
    ("asignada", LifecycleAction.CANCEL, "cancelada"),
    ("en_proceso", LifecycleAction.CANCEL, "cancelada"),
])
def test_valid_lifecycle_transitions(state, action, expected):
    assert can_transition(state, action)
    assert transition(state, action) == expected


@pytest.mark.parametrize("state, action", [
    ("confirmada", LifecycleAction.ACCEPT),
    ("confirmada", LifecycleAction.START),
    ("confirmada", LifecycleAction.COMPLETE),
    ("confirmada", LifecycleAction.CANCEL),
    ("cancelada", LifecycleAction.ACCEPT),
    ("cancelada", LifecycleAction.START),
    ("cancelada", LifecycleAction.COMPLETE),
    ("cancelada", LifecycleAction.CONFIRM),
    ("activa", LifecycleAction.START),
    ("activa", LifecycleAction.COMPLETE),
    ("asignada", LifecycleAction.COMPLETE),
    ("en_proceso", LifecycleAction.CONFIRM),
    ("completada", LifecycleAction.COMPLETE),
])
def test_invalid_lifecycle_transitions_are_rejected(state, action):
    assert not can_transition(state, action)
    with pytest.raises(TaskLifecycleError):
        transition(state, action)


def test_unknown_state_cannot_transition():
    assert not can_transition("desconocida", LifecycleAction.START)
    with pytest.raises(TaskLifecycleError):
        transition("desconocida", LifecycleAction.START)
