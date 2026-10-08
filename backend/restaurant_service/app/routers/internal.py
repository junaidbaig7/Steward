"""Service-to-service endpoints for the order Saga. Protected by X-Internal-Key and
blocked at the API gateway, so browsers can never reach them."""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from steward_common.postgres import get_db
from steward_common.security import require_internal_key

from ..repositories import dish_repository as dishes
from ..repositories import restaurant_repository as restaurants
from ..services import inventory_service

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_key)])
DB = Annotated[Session, Depends(get_db)]


class QuoteRequest(BaseModel):
    dish_ids: list[int] = Field(min_length=1, max_length=50)


class ReserveItem(BaseModel):
    dish_id: int
    quantity: int = Field(ge=1, le=50)


class ReserveRequest(BaseModel):
    order_id: int
    restaurant_id: int
    items: list[ReserveItem] = Field(min_length=1, max_length=50)


@router.post("/dishes/quote")
def quote(body: QuoteRequest, db: DB):
    """Authoritative prices/availability — the order service never trusts client-side prices."""
    items = dishes.get_many_dicts(db, body.dish_ids)
    restaurant_ids = {d["restaurant_id"] for d in items}
    restaurant_info = {
        rid: restaurants.get_with_stats(db, restaurant_id=rid) for rid in restaurant_ids
    }
    return {
        "dishes": [
            {k: d[k] for k in ("id", "restaurant_id", "name", "food_type", "price", "is_available", "stock", "in_stock")}
            for d in items
        ],
        "restaurants": {
            rid: {k: r[k] for k in ("id", "name", "is_active", "delivery_fee", "min_order_amount")}
            for rid, r in restaurant_info.items() if r
        },
    }


@router.post("/inventory/reserve")
def reserve(body: ReserveRequest, db: DB):
    inventory_service.reserve(db, body.order_id, body.restaurant_id, [(i.dish_id, i.quantity) for i in body.items])
    return {"order_id": body.order_id, "status": "RESERVED"}


@router.post("/inventory/{order_id}/commit")
def commit(order_id: int, db: DB):
    return {"order_id": order_id, "committed": inventory_service.commit(db, order_id)}


@router.post("/inventory/{order_id}/release")
def release(order_id: int, db: DB, include_committed: bool = False):
    """Compensating action of the Saga: return reserved stock."""
    return {"order_id": order_id, "released": inventory_service.release(db, order_id, include_committed)}
