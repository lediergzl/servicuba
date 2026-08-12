import pytest

from app.services.task_lifecycle import (
    LifecycleAction,
    TaskLifecycleError,
    can_transition,
    transition,
)


def test_happy_path():
    state = "activa"
    state = transition(state, LifecycleAction.ACCEPT)
    assert state == "asignada"
    state = transition(state, LifecycleAction.START)
    assert state == "en_proceso"
    state = transition(state, LifecycleAction.COMPLETE)
    assert state == "completada"
    state = transition(state, LifecycleAction.CONFIRM)
    assert state == "confirmada"


@pytest.mark.parametrize(
    "state,action",
    [
        ("activa", LifecycleAction.START),
        ("activa", LifecycleAction.COMPLETE),
        ("asignada", LifecycleAction.COMPLETE),
        ("completada", LifecycleAction.CANCEL),
        ("confirmada", LifecycleAction.CANCEL),
        ("cancelada", LifecycleAction.ACCEPT),
    ],
)
def test_invalid_transitions_are_rejected(state, action):
    assert not can_transition(state, action)
    with pytest.raises(TaskLifecycleError):
        transition(state, action)


@pytest.mark.parametrize("state", ["activa", "asignada", "en_proceso"])
def test_cancellation_is_allowed_only_before_completion(state):
    assert transition(state, LifecycleAction.CANCEL) == "cancelada"
