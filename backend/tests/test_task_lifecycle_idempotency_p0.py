from app.models.task import TaskStatus
from app.services.task_lifecycle import LifecycleAction, TaskLifecycleError, transition


def test_repeated_start_is_rejected_without_new_transition():
    assert transition(TaskStatus.ASIGNADA.value, LifecycleAction.START) == TaskStatus.EN_PROCESO.value
    try:
        transition(TaskStatus.EN_PROCESO.value, LifecycleAction.START)
    except TaskLifecycleError:
        return
    raise AssertionError("repeated start must be rejected")


def test_repeated_complete_is_rejected_without_new_transition():
    assert transition(TaskStatus.EN_PROCESO.value, LifecycleAction.COMPLETE) == TaskStatus.COMPLETADA.value
    try:
        transition(TaskStatus.COMPLETADA.value, LifecycleAction.COMPLETE)
    except TaskLifecycleError:
        return
    raise AssertionError("repeated complete must be rejected")


def test_repeated_confirm_is_rejected_without_new_transition():
    assert transition(TaskStatus.COMPLETADA.value, LifecycleAction.CONFIRM) == TaskStatus.CONFIRMADA.value
    try:
        transition(TaskStatus.CONFIRMADA.value, LifecycleAction.CONFIRM)
    except TaskLifecycleError:
        return
    raise AssertionError("repeated confirm must be rejected")


def test_repeated_cancel_is_rejected_without_new_transition():
    assert transition(TaskStatus.ACTIVA.value, LifecycleAction.CANCEL) == TaskStatus.CANCELADA.value
    try:
        transition(TaskStatus.CANCELADA.value, LifecycleAction.CANCEL)
    except TaskLifecycleError:
        return
    raise AssertionError("repeated cancel must be rejected")
