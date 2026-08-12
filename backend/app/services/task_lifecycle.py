from enum import Enum


class TaskLifecycleError(ValueError):
    """Raised when a task attempts an invalid business-state transition."""


class LifecycleAction(str, Enum):
    ACCEPT = "accept"
    START = "start"
    COMPLETE = "complete"
    CONFIRM = "confirm"
    CANCEL = "cancel"


# Explicit state machine for the marketplace contract.
# Keep this centralized so routers cannot silently invent new transitions.
_ALLOWED = {
    "activa": {LifecycleAction.ACCEPT, LifecycleAction.CANCEL},
    "asignada": {LifecycleAction.START, LifecycleAction.CANCEL},
    "en_proceso": {LifecycleAction.COMPLETE, LifecycleAction.CANCEL},
    "completada": {LifecycleAction.CONFIRM},
    "confirmada": set(),
    "cancelada": set(),
}


def can_transition(state: str, action: LifecycleAction) -> bool:
    return action in _ALLOWED.get(state, set())


def transition(state: str, action: LifecycleAction) -> str:
    if not can_transition(state, action):
        raise TaskLifecycleError(
            f"Transición no permitida: estado={state!r}, acción={action.value!r}"
        )

    targets = {
        ("activa", LifecycleAction.ACCEPT): "asignada",
        ("asignada", LifecycleAction.START): "en_proceso",
        ("en_proceso", LifecycleAction.COMPLETE): "completada",
        ("completada", LifecycleAction.CONFIRM): "confirmada",
        ("activa", LifecycleAction.CANCEL): "cancelada",
        ("asignada", LifecycleAction.CANCEL): "cancelada",
        ("en_proceso", LifecycleAction.CANCEL): "cancelada",
    }
    return targets[(state, action)]
