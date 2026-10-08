"""Order persistence. Display names (restaurant, customer) are joined read-only from
tables owned by other services — the Order Service never writes to them."""
from datetime import datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..models.order import Order, OrderStatusHistory

_NAMES = text("""
    SELECT o.id, r.name AS restaurant_name, COALESCE(u.full_name, u.phone, u.email) AS customer_name
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    JOIN users u ON u.id = o.user_id
    WHERE o.id = ANY(:ids)
""")


def display_names(db: Session, order_ids: list[int]) -> dict[int, tuple[str, str]]:
    if not order_ids:
        return {}
    return {row.id: (row.restaurant_name, row.customer_name) for row in db.execute(_NAMES, {"ids": order_ids})}


def get(db: Session, order_id: int) -> Order | None:
    return db.get(Order, order_id)


def get_for_update(db: Session, order_id: int) -> Order | None:
    """SELECT ... FOR UPDATE: serialises concurrent status changes on the same order
    (e.g. a payment confirmation racing the stale-order sweeper)."""
    return db.scalar(select(Order).where(Order.id == order_id).with_for_update())


def add_history(db: Session, order: Order, status: str, note: str | None, changed_by: int | None) -> None:
    # Appending to the relationship keeps order.history current for the API response.
    order.history.append(OrderStatusHistory(
        status=status, note=note, changed_by=changed_by, created_at=datetime.now(timezone.utc),
    ))


def list_orders(
    db: Session, *, user_id: int | None = None, status: str | None = None, restaurant_id: int | None = None,
    search_id: int | None = None, limit: int, offset: int,
) -> tuple[list[Order], int]:
    stmt = select(Order)
    if user_id is not None:
        stmt = stmt.where(Order.user_id == user_id)
    if status:
        stmt = stmt.where(Order.status == status)
    if restaurant_id:
        stmt = stmt.where(Order.restaurant_id == restaurant_id)
    if search_id:
        stmt = stmt.where(Order.id == search_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset)).all()
    return list(rows), total


def stale_unpaid_ids(db: Session, older_than: datetime) -> list[int]:
    return list(db.scalars(
        select(Order.id).where(Order.status == "PLACED", Order.created_at < older_than)
    ).all())


def recently_closed_ids(db: Session, since: datetime) -> list[int]:
    """FAILED/CANCELLED orders whose stock release may need a retry (release is idempotent)."""
    return list(db.scalars(
        select(Order.id).where(Order.status.in_(["FAILED", "CANCELLED"]), Order.updated_at >= since)
    ).all())
