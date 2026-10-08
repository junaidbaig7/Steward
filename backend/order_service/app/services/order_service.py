"""Order lifecycle and the checkout Saga.

    PLACED ──pay──► CONFIRMED ─► PREPARING ─► READY ─► OUT_FOR_DELIVERY ─► DELIVERED
      │                 │            │
      ├─ payment fails ─┴────────────┴──► FAILED / CANCELLED   (+ release reserved stock)
      └─ unpaid for 15 min ──────────────► FAILED              (+ release reserved stock)

Checkout Saga (no 2PC):
  1. quote      — authoritative prices from the Restaurant Service
  2. order      — insert order + items in a local transaction (not yet committed)
  3. reserve    — Restaurant Service decrements stock
  4. commit     — if this fails, compensate: release the reserved stock
"""
import logging
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from steward_common.activity import log_activity
from steward_common.security import CurrentUser

from ..models.order import (
    CANCELLED, CONFIRMED, DELIVERED, FAILED, ORDER_FLOW, OUT_FOR_DELIVERY, PLACED, PREPARING, READY,
    TERMINAL_STATES, Order, OrderItem,
)
from ..repositories import order_repository as orders
from ..schemas.order import OrderCreate, OrderOut
from . import restaurant_client

log = logging.getLogger("order-service.orders")

TAX_RATE = Decimal("0.05")                     # GST on restaurant food
UNPAID_ORDER_TIMEOUT = timedelta(minutes=15)

# Status changes an admin may make by hand. CONFIRMED/FAILED are set only by the payment flow.
ADMIN_TRANSITIONS = {
    CONFIRMED: {PREPARING, CANCELLED},
    PREPARING: {READY, CANCELLED},
    READY: {OUT_FOR_DELIVERY},
    OUT_FOR_DELIVERY: {DELIVERED},
    PLACED: {CANCELLED},
}
# Who may cancel, and from which states.
CUSTOMER_CANCELLABLE = {PLACED}                              # before payment completes
ADMIN_CANCELLABLE = {s for s, targets in ADMIN_TRANSITIONS.items() if CANCELLED in targets}
# Cancelling from these states returns stock (nothing has been cooked yet).
RELEASE_STOCK_FROM = {PLACED, CONFIRMED}


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def next_status(current: str) -> str | None:
    """The next step an admin can advance to (PLACED waits for payment instead)."""
    if current == PLACED or current in TERMINAL_STATES:
        return None
    i = ORDER_FLOW.index(current)
    return ORDER_FLOW[i + 1] if i + 1 < len(ORDER_FLOW) else None


def to_out(db: Session, order: Order, *, viewer: CurrentUser | None = None) -> OrderOut:
    names = orders.display_names(db, [order.id]).get(order.id, (None, None))
    out = OrderOut.model_validate(order)
    out.restaurant_name, out.customer_name = names
    out.payment_status = order.payments[-1].status if order.payments else None
    cancellable = ADMIN_CANCELLABLE if viewer and viewer.is_admin else CUSTOMER_CANCELLABLE
    out.can_cancel = order.status in cancellable
    out.next_status = next_status(order.status)
    return out


def to_out_many(db: Session, rows: list[Order]) -> list[OrderOut]:
    names = orders.display_names(db, [o.id for o in rows])
    result = []
    for o in rows:
        out = OrderOut.model_validate(o)
        out.restaurant_name, out.customer_name = names.get(o.id, (None, None))
        out.payment_status = o.payments[-1].status if o.payments else None
        out.next_status = next_status(o.status)
        result.append(out)
    return result


# ── Checkout Saga ─────────────────────────────────────────────────────
def place_order(db: Session, user: CurrentUser, body: OrderCreate) -> Order:
    quantities = {i.dish_id: i.quantity for i in body.items}

    # Step 1: authoritative quote (never trust client-side prices).
    quote = restaurant_client.quote(list(quantities))
    dishes = {d["id"]: d for d in quote["dishes"]}
    missing = set(quantities) - set(dishes)
    if missing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Some items are no longer on the menu. Please refresh your cart.")
    restaurant_ids = {d["restaurant_id"] for d in dishes.values()}
    if len(restaurant_ids) != 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "An order can contain dishes from one restaurant only.")
    restaurant_id = restaurant_ids.pop()
    restaurant = quote["restaurants"][str(restaurant_id)]
    if not restaurant["is_active"]:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{restaurant['name']} is not accepting orders right now.")
    for dish_id, qty in quantities.items():
        d = dishes[dish_id]
        if not d["is_available"]:
            raise HTTPException(status.HTTP_409_CONFLICT, f"{d['name']} is currently unavailable.")
        if d["stock"] < qty:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{d['name']} is sold out." if d["stock"] == 0 else f"Only {d['stock']} × {d['name']} left.",
            )

    subtotal = _money(sum(Decimal(str(dishes[i]["price"])) * q for i, q in quantities.items()))
    if subtotal < _money(restaurant["min_order_amount"]):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Minimum order for {restaurant['name']} is ₹{restaurant['min_order_amount']:.0f}.",
        )
    delivery_fee = _money(restaurant["delivery_fee"])
    tax = _money(subtotal * TAX_RATE)

    # Step 2: local transaction — order, items and first history row (flushed, not committed).
    order = Order(
        user_id=user.id, restaurant_id=restaurant_id, status=PLACED, subtotal=subtotal,
        delivery_fee=delivery_fee, tax_amount=tax, total_amount=subtotal + delivery_fee + tax,
        delivery_address=body.delivery_address.strip(), contact_phone=body.contact_phone, notes=body.notes,
        items=[
            OrderItem(dish_id=i, dish_name=dishes[i]["name"], food_type=dishes[i]["food_type"],
                      unit_price=_money(dishes[i]["price"]), quantity=q)
            for i, q in quantities.items()
        ],
    )
    db.add(order)
    db.flush()  # assigns order.id
    orders.add_history(db, order, PLACED, "Order placed — awaiting payment", user.id)

    # Step 3: reserve stock in the Restaurant Service.
    try:
        restaurant_client.reserve_stock(
            order.id, restaurant_id, [{"dish_id": i, "quantity": q} for i, q in quantities.items()]
        )
    except HTTPException:
        db.rollback()  # nothing was reserved, so simply abandon the local transaction
        raise

    # Step 4: commit locally; if that fails, compensate the reservation.
    try:
        db.commit()
    except Exception:
        db.rollback()
        restaurant_client.release_stock(order.id)
        log.exception("Order commit failed; reserved stock released (compensation)")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "We couldn't place your order. Please try again.")

    log_activity(user.id, "ORDER_PLACED", order_id=order.id, restaurant_id=restaurant_id,
                 total=float(order.total_amount), items=len(quantities))
    log.info("Order %s placed by user %s (₹%s)", order.id, user.id, order.total_amount)
    db.refresh(order)
    return order


# ── State transitions ─────────────────────────────────────────────────
def _transition(db: Session, order: Order, new_status: str, note: str | None, actor: int | None) -> None:
    previous = order.status
    order.status = new_status
    if new_status in (CANCELLED, FAILED):
        order.cancel_reason = note
    orders.add_history(db, order, new_status, note, actor)
    db.commit()
    log.info("Order %s: %s → %s", order.id, previous, new_status)

    # Saga side effects after the local commit.
    if new_status in (CANCELLED, FAILED) and previous in RELEASE_STOCK_FROM:
        # compensating action; a paid order's reservation is already COMMITTED
        restaurant_client.release_stock(order.id, include_committed=previous == CONFIRMED)
    elif new_status == CONFIRMED:
        restaurant_client.commit_stock(order.id)


def confirm_paid(db: Session, order_id: int, note: str) -> Order:
    """Called by the payment flow after a verified successful payment."""
    order = orders.get_for_update(db, order_id)
    if order.status == PLACED:
        _transition(db, order, CONFIRMED, note, None)
    return order


def fail_unpaid(db: Session, order_id: int, reason: str) -> Order | None:
    """Payment failed or timed out → FAILED and release stock (compensation)."""
    order = orders.get_for_update(db, order_id)
    if order and order.status == PLACED:
        _transition(db, order, FAILED, reason, None)   # commits caller's pending changes too
    else:
        db.commit()  # keep any pending payment update even if the order already closed
    return order


def cancel(db: Session, order_id: int, user: CurrentUser, reason: str | None) -> Order:
    order = orders.get_for_update(db, order_id)
    if order is None or (order.user_id != user.id and not user.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    allowed = ADMIN_CANCELLABLE if user.is_admin else CUSTOMER_CANCELLABLE
    if order.status not in allowed:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This order can't be cancelled once it is {order.status.replace('_', ' ').lower()}.")
    note = reason or ("Cancelled by restaurant" if user.is_admin else "Cancelled by customer")
    if order.status == CONFIRMED:
        note += " · refund to be issued"
    _transition(db, order, CANCELLED, note, user.id)
    log_activity(order.user_id, "ORDER_CANCELLED", order_id=order.id)
    return order


def admin_update_status(db: Session, order_id: int, admin: CurrentUser, new_status: str, note: str | None) -> Order:
    order = orders.get_for_update(db, order_id)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    if new_status == CANCELLED:
        db.rollback()
        return cancel(db, order_id, admin, note)
    if new_status not in ADMIN_TRANSITIONS.get(order.status, set()):
        hint = " Orders are confirmed automatically after payment." if order.status == PLACED else ""
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Can't move an order from {order.status} to {new_status}.{hint}",
        )
    _transition(db, order, new_status, note, admin.id)
    if new_status == DELIVERED:
        log_activity(order.user_id, "ORDER_DELIVERED", order_id=order.id)
    return order


def expire_stale_orders(db: Session) -> int:
    """Saga timeout: unpaid orders older than 15 minutes fail and release their stock."""
    cutoff = datetime.now(timezone.utc) - UNPAID_ORDER_TIMEOUT
    count = 0
    for order_id in orders.stale_unpaid_ids(db, cutoff):
        if fail_unpaid(db, order_id, "Payment not completed within 15 minutes"):
            count += 1
    # Retry compensations that may have failed earlier. Only RESERVED rows are touched,
    # so stock for food already cooked (COMMITTED) is never returned by mistake.
    for order_id in orders.recently_closed_ids(db, datetime.now(timezone.utc) - timedelta(hours=1)):
        restaurant_client.release_stock(order_id)
    return count

