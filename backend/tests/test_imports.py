"""Low-cost smoke tests that do not require a live database."""


def test_core_model_enums_import():
    from app.models.task import TaskStatus
    from app.models.application import AppStatus

    assert TaskStatus.ACTIVA
    assert AppStatus.PENDIENTE
