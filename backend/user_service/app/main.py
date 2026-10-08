"""User Service — identity: mobile OTP (Redis), Google OAuth, admin login, JWT, profile, activity."""
from steward_common.app_factory import create_app
from steward_common.health import health_router
from steward_common.mongo import ping_mongo
from steward_common.postgres import ping_postgres
from steward_common.redis_client import ping_redis

from .routers import auth, users

app = create_app("STEWARD User Service", "Authentication, users and user activity")

app.include_router(
    health_router("user-service", {"postgres": ping_postgres, "redis": ping_redis, "mongodb": ping_mongo})
)
app.include_router(auth.router)
app.include_router(users.router)
