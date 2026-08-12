"""Smoke tests for the application package.

These tests intentionally avoid requiring a live PostgreSQL instance. They
catch broken imports and missing application modules early in CI/deploys.
"""


def test_application_imports():
    from app.main import app

    assert app.title == "Servicios Locales API"
