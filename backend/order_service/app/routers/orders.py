from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from steward_common.postgres import get_db
from steward_common.redis_client import get_redis, key
from steward_common.security import AdminUser, AuthUser, CustomerUser

from ..repositories import order_repository as orders
from ..schemas.order import CancelRequest, OrderCreate, OrderOut, OrderStatus, StatusUpdate
from ..services import order_service

router = APIRouter(prefix="/orders", tags=["orders"])
DB = Annotated[Session, Depends(get_db)]
IDEMPOTENCY_TTL = 24 * 3600


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def place_order(
    body: OrderCreate, db: DB, user: CustomerUser,
    idempotency_key: Annotated[str | None, Header(max_length=64)] = None,
):
    """Checkout: re-price from the menu, create the order and reserve stock (Saga steps 1–4).

    An `Idempotency-Key` header makes retries / double-clicks return the same order."""
    redis_key = key("idem", str(user.id), idempotency_key) if idempotency_key else None
    if redis_key:
        try:
            if existing := get_redis().get(redis_key):
                return order_service.to_out(db, orders.get(db, int(existing)), viewer=user)
        except Exception:
            redis_key = None  # Redis unavailable → proceed without idempotency
    order = order_service.place_order(db, user, body)
    if redis_key:
        get_redis().set(redis_key, order.id, ex=IDEMPOTENCY_TTL)
    return order_service.to_out(db, order, viewer=user)


@router.get("")
def my_orders(
    db: DB, user: AuthUser,
    status_filter: Annotated[OrderStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    rows, total = orders.list_orders(db, user_id=user.id, status=status_filter, limit=limit, offset=offset)
    return {"total": total, "items": order_service.to_out_many(db, rows)}


# Declared before /{order_id} so "admin" is not parsed as an id.
@router.get("/admin/all")
def all_orders(
    db: DB, _: AdminUser,
    status_filter: Annotated[OrderStatus | None, Query(alias="status")] = None,
    restaurant_id: int | None = None,
    order_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    rows, total = orders.list_orders(
        db, status=status_filter, restaurant_id=restaurant_id, search_id=order_id, limit=limit, offset=offset
    )
    return {"total": total, "items": order_service.to_out_many(db, rows)}


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: DB, user: AuthUser):
    """Order details + status timeline. The tracking page polls this endpoint."""
    order = orders.get(db, order_id)
    if order is None or (order.user_id != user.id and not user.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    return order_service.to_out(db, order, viewer=user)


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order(order_id: int, db: DB, user: AuthUser, body: CancelRequest | None = None):
    order = order_service.cancel(db, order_id, user, body.reason if body else None)
    return order_service.to_out(db, order, viewer=user)


@router.patch("/{order_id}/status", response_model=OrderOut)
def update_status(order_id: int, body: StatusUpdate, db: DB, admin: AdminUser):
    order = order_service.admin_update_status(db, order_id, admin, body.status, body.note)
    return order_service.to_out(db, order, viewer=admin)
