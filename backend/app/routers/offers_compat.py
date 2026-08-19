"""Compatibility route for the public/client offer discovery API.

The frontend historically called /api/tasks/ofertas/nearby while the
canonical discovery implementation lives under /api/discovery/offers.
Keep both contracts valid so deployed clients do not break during the
API migration.
"""

from fastapi import Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.task import Task, TaskStatus
from ..models.user import User, UserPlan
from ..services.auth import get_current_user
from ..services.nearby import find_nearby
from ..services.plans import is_premium_active, PLAN_GRATIS_RADIO_MAX_KM, PLAN_PREMIUM_RADIO_MAX_KM
from fastapi import Depends


def install(tasks_router):
    @tasks_router.get("/ofertas/nearby", include_in_schema=True)
    def get_nearby_offers_compat(
        lat: float = Query(...),
        lng: float = Query(...),
        radius_km: float = Query(3.0, ge=0.1, le=50),
        category_id: Optional[int] = None,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        max_radius = PLAN_PREMIUM_RADIO_MAX_KM if is_premium_active(current_user) else PLAN_GRATIS_RADIO_MAX_KM
        radius_km = min(radius_km, max_radius)
        results = find_nearby(
            db,
            lat,
            lng,
            radius_km,
            tipo="oferta",
            category_id=category_id,
        )
        return results

    return tasks_router
