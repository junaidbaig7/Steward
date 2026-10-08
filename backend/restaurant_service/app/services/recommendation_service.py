"""Lightweight recommendations — no ML training, just SQL + vectors:

  similar dishes   : nearest neighbours by cosine distance (pgvector `<=>`)
  based on orders  : the user's "taste vector" = AVG() of embeddings of dishes they ordered,
                     then nearest dishes they have not ordered yet
  popular          : most-ordered dishes in the last 30 days (fallback for guests)

Order history lives in the Order Service, so it is fetched over HTTP (internal API).
"""
import logging

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from steward_common.config import get_settings

from ..repositories import dish_repository as dishes

log = logging.getLogger("restaurant-service.recommendations")

_ORDERABLE = "d.is_available AND d.stock > 0 AND r.is_active"

_SIMILAR = text(f"""
    SELECT d.id
    FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
    WHERE d.id <> :dish_id AND d.food_type = :food_type AND {_ORDERABLE}
    ORDER BY d.embedding <=> (SELECT embedding FROM dishes WHERE id = :dish_id)
    LIMIT :limit
""")

# pgvector supports AVG(vector): the centroid of everything the user has ordered.
# bool_and(): if every past order was vegetarian, only recommend vegetarian dishes.
_FROM_TASTE = text(f"""
    WITH taste AS (
        SELECT AVG(embedding) AS v, bool_and(food_type = 'VEG') AS veg_only
        FROM dishes WHERE id = ANY(:ordered_ids)
    )
    SELECT d.id
    FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id, taste
    WHERE NOT (d.id = ANY(:ordered_ids)) AND {_ORDERABLE}
      AND (NOT taste.veg_only OR d.food_type = 'VEG')
    ORDER BY d.embedding <=> taste.v
    LIMIT :limit
""")

_FALLBACK = text(f"""
    SELECT d.id FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
    WHERE {_ORDERABLE}
    ORDER BY d.stock DESC, d.id   -- before any orders exist: best-stocked dishes first
    LIMIT :limit
""")


def _hydrate(db: Session, ids: list[int]) -> list[dict]:
    """Fetch full dish rows and keep the ranking order from the vector query."""
    by_id = {d["id"]: d for d in dishes.get_many_dicts(db, ids)}
    return [by_id[i] for i in ids if i in by_id]


def similar_to_dish(db: Session, dish_id: int, limit: int) -> list[dict] | None:
    dish = dishes.get(db, dish_id)
    if dish is None:
        return None
    ids = db.execute(_SIMILAR, {"dish_id": dish_id, "food_type": dish.food_type, "limit": limit}).scalars().all()
    return _hydrate(db, list(ids))


def _order_service(path: str) -> list[int]:
    settings = get_settings()
    try:
        r = httpx.get(f"{settings.order_service_url}/internal/{path}",
                      headers={"x-internal-key": settings.internal_api_key}, timeout=3.0)
        r.raise_for_status()
        return r.json().get("dish_ids", [])
    except Exception:
        # Graceful degradation: recommendations still work if the order service is down.
        log.warning("Order service unavailable for %s; using fallback", path)
        return []


def for_user(db: Session, user_id: int | None, limit: int) -> tuple[str, list[dict]]:
    if user_id:
        ordered = _order_service(f"stats/users/{user_id}/dishes")
        if ordered:
            ids = db.execute(_FROM_TASTE, {"ordered_ids": ordered, "limit": limit}).scalars().all()
            if ids:
                return "Based on your previous orders", _hydrate(db, list(ids))

    popular = _order_service("stats/popular-dishes")
    items = [d for d in _hydrate(db, popular) if d["in_stock"]][:limit]
    if len(items) < limit:
        seen = {d["id"] for d in items}
        extra = db.execute(_FALLBACK, {"limit": limit * 2}).scalars().all()
        items += [d for d in _hydrate(db, [i for i in extra if i not in seen])][: limit - len(items)]
    return "Popular right now", items
