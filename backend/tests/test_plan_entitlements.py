from datetime import datetime, timedelta
from backend.app.models.user import User, UserPlan
from backend.app.services.plans import effective_plan, services_daily_limit, coverage_radius_km, can_create_promotional_ads


def test_free_cannot_publish_or_create_ads():
    user = User(nombre="Free", telefono="1", password_hash="x", es_trabajador=False, plan=UserPlan.GRATIS)
    assert effective_plan(user) == "gratis"
    assert services_daily_limit(user) == 0
    assert can_create_promotional_ads(user) is False


def test_base_has_standard_limits_only():
    user = User(nombre="Base", telefono="2", password_hash="x", es_trabajador=True, plan=UserPlan.BASE)
    assert effective_plan(user) == "base"
    assert services_daily_limit(user) == 1
    assert coverage_radius_km(user) == 5.0
    assert can_create_promotional_ads(user) is False


def test_active_premium_gets_all_benefits():
    user = User(nombre="Premium", telefono="3", password_hash="x", es_trabajador=True, plan=UserPlan.PREMIUM, plan_expira=datetime.utcnow()+timedelta(days=1))
    assert effective_plan(user) == "premium"
    assert services_daily_limit(user) == 10
    assert coverage_radius_km(user) == 20.0
    assert can_create_promotional_ads(user) is True


def test_expired_premium_loses_benefits_without_mutating_subscription_history():
    user = User(nombre="Expired", telefono="4", password_hash="x", es_trabajador=True, plan=UserPlan.PREMIUM, plan_expira=datetime.utcnow()-timedelta(seconds=1))
    assert effective_plan(user) == "base"
    assert services_daily_limit(user) == 1
    assert can_create_promotional_ads(user) is False
