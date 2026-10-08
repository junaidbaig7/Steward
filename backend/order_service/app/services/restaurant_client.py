"""HTTP client for the Restaurant Service's internal (service-to-service) API.

Network failures are translated into clear 503 errors so the user sees
"try again" instead of a stack trace, and the Saga can compensate.
"""
import logging

import httpx
from fastapi import HTTPException, status

from steward_common.config import get_settings

log = logging.getLogger("order-service.restaurant-client")


def _call(method: str, path: str, json: dict | None = None) -> dict:
    settings = get_settings()
    try:
        r = httpx.request(
            method, f"{settings.restaurant_service_url}/internal{path}", json=json,
            headers={"x-internal-key": settings.internal_api_key}, timeout=8.0,
        )
    except httpx.HTTPError:
        log.exception("Restaurant service unreachable: %s %s", method, path)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The menu service is unavailable. Please try again.")
    if r.status_code == 409:  # business conflict (sold out, restaurant closed) — pass the message through
        raise HTTPException(status.HTTP_409_CONFLICT, r.json().get("detail", "Some items are no longer available."))
    if r.status_code >= 400:
        log.error("Restaurant service error %s on %s: %s", r.status_code, path, r.text[:200])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not confirm your items. Please try again.")
    return r.json()


def quote(dish_ids: list[int]) -> dict:
    return _call("POST", "/dishes/quote", {"dish_ids": dish_ids})


def reserve_stock(order_id: int, restaurant_id: int, items: list[dict]) -> None:
    _call("POST", "/inventory/reserve", {"order_id": order_id, "restaurant_id": restaurant_id, "items": items})


def commit_stock(order_id: int) -> None:
    """Marks the reservation as final. Best-effort: the order is already paid and confirmed."""
    try:
        _call("POST", f"/inventory/{order_id}/commit")
    except HTTPException:
        log.warning("Could not mark stock committed for order %s (reservation stays valid)", order_id)


def release_stock(order_id: int, include_committed: bool = False) -> bool:
    """Compensating action. Returns False (instead of raising) so callers can log and retry later."""
    suffix = "?include_committed=true" if include_committed else ""
    try:
        _call("POST", f"/inventory/{order_id}/release{suffix}")
        return True
    except HTTPException:
        log.error("Stock release for order %s failed; the stale-order sweeper will retry", order_id)
        return False
