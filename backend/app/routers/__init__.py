from .auth import router as auth_router
from .users import router as users_router
from .categories import router as categories_router
from .tasks import router as tasks_router
from .applications import router as applications_router
from .reviews import router as reviews_router
from .chat import router as chat_router
from .push import router as push_router
from .verification import router as verification_router
from .payments import router as payments_router
from .ads import router as ads_router
from .password_reset import router as password_reset_router

# Backwards-compatible API contract used by existing frontend builds.
# Installing this after importing the task router means /api/tasks/ofertas/nearby
# is available without duplicating the canonical discovery implementation.
from .offers_compat import install as install_offers_compat
install_offers_compat(tasks_router)
