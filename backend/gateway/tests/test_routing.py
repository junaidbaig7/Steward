"""The gateway maps the first path segment to a service and never exposes /internal."""
from app.services.proxy import resolve_service


def test_known_prefixes():
    assert resolve_service("auth/otp/request") == "user"
    assert resolve_service("restaurants/wok-and-roll/dishes") == "restaurant"
    assert resolve_service("search") == "restaurant"
    assert resolve_service("payments/verify") == "order"
    assert resolve_service("analytics/admin/overview") == "order"


def test_internal_and_unknown_paths_blocked():
    assert resolve_service("internal/inventory/reserve") is None
    assert resolve_service("restaurants/internal/x") is None
    assert resolve_service("admin-secrets") is None
    assert resolve_service("") is None
