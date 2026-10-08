"""Service-to-service statistics used by the Restaurant Service's recommendations."""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from steward_common.postgres import get_db
from steward_common.security import require_internal_key

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_key)])
DB = Annotated[Session, Depends(get_db)]

# Orders that actually happened (paid), as opposed to abandoned/failed ones.
_FULFILLED = "('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')"


@router.get("/stats/users/{user_id}/dishes")
def user_dishes(user_id: int, db: DB):
    """Dishes this user ordered, most frequently ordered first."""
    rows = db.execute(text(f"""
        SELECT oi.dish_id, SUM(oi.quantity) AS qty
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.user_id = :user_id AND o.status IN {_FULFILLED} AND oi.dish_id IS NOT NULL
        GROUP BY oi.dish_id
        ORDER BY qty DESC
        LIMIT 20
    """), {"user_id": user_id}).all()
    return {"dish_ids": [r.dish_id for r in rows]}


@router.get("/orders/{order_id}/review-eligibility")
def review_eligibility(order_id: int, user_id: int, db: DB):
    """A customer may review a restaurant only for their own delivered order (verified purchase)."""
    row = db.execute(
        text("SELECT user_id, restaurant_id, status FROM orders WHERE id = :id"), {"id": order_id}
    ).first()
    if row is None or row.user_id != user_id:
        return {"eligible": False, "reason": "Order not found."}
    if row.status != "DELIVERED":
        return {"eligible": False, "reason": "You can review an order once it has been delivered."}
    return {"eligible": True, "restaurant_id": row.restaurant_id}


@router.get("/stats/popular-dishes")
def popular_dishes(db: DB):
    """Most-ordered dishes over the last 30 days."""
    rows = db.execute(text(f"""
        SELECT oi.dish_id, SUM(oi.quantity) AS qty
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status IN {_FULFILLED} AND oi.dish_id IS NOT NULL
          AND o.created_at >= now() - INTERVAL '30 days'
        GROUP BY oi.dish_id
        ORDER BY qty DESC
        LIMIT 24
    """)).all()
    return {"dish_ids": [r.dish_id for r in rows]}
