"""Gateway routing table: the first path segment after /api decides the downstream service."""
from steward_common.config import get_settings

settings = get_settings()

SERVICE_URLS = {
    "user": settings.user_service_url,
    "restaurant": settings.restaurant_service_url,
    "order": settings.order_service_url,
}

ROUTES: dict[str, str] = {
    # User Service — identity, OTP, OAuth, profile, user activity
    "auth": "user",
    "users": "user",
    # Restaurant Service — catalog, inventory, semantic search, reviews
    "restaurants": "restaurant",
    "dishes": "restaurant",
    "categories": "restaurant",
    "search": "restaurant",
    "reviews": "restaurant",
    "recommendations": "restaurant",
    # Order Service — cart checkout, orders, payments, analytics
    "orders": "order",
    "payments": "order",
    "analytics": "order",
}

# Service-to-service endpoints are never reachable from outside.
BLOCKED_SEGMENTS = {"internal"}
