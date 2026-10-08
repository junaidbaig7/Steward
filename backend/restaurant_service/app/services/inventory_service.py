"""Inventory operations used by the order Saga (called only via /internal endpoints).

  reserve(order)  — atomically decrement stock and record RESERVED rows
  commit(order)   — payment succeeded: RESERVED → COMMITTED (stock stays decremented)
  release(order)  — compensating action: RESERVED → RELEASED and stock restored
                    (include_committed=True also returns stock of a paid order
                     cancelled before the kitchen started cooking)

Each step is idempotent, so a retried HTTP call can never double-count stock.
"""
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

# Conditional decrement: succeeds only if enough stock remains. Because the check and
# the update are one statement, two concurrent orders cannot oversell the last plate.
_DECREMENT = text("""
    UPDATE dishes SET stock = stock - :qty
    WHERE id = :dish_id AND restaurant_id = :restaurant_id AND is_available AND stock >= :qty
    RETURNING id
""")

_RELEASE = text("""
    WITH released AS (
        UPDATE inventory_reservations SET status = 'RELEASED'
        WHERE order_id = :order_id AND status = ANY(:statuses)
        RETURNING dish_id, quantity
    )
    UPDATE dishes d SET stock = d.stock + r.quantity
    FROM released r WHERE d.id = r.dish_id
    RETURNING d.id
""")


def reserve(db: Session, order_id: int, restaurant_id: int, items: list[tuple[int, int]]) -> None:
    already = db.execute(
        text("SELECT count(*) FROM inventory_reservations WHERE order_id = :o"), {"o": order_id}
    ).scalar_one()
    if already:
        return  # idempotent retry

    active = db.execute(
        text("SELECT is_active FROM restaurants WHERE id = :r"), {"r": restaurant_id}
    ).scalar()
    if not active:
        raise HTTPException(status.HTTP_409_CONFLICT, "This restaurant is not accepting orders right now.")

    try:
        for dish_id, qty in items:
            if db.execute(_DECREMENT, {"dish_id": dish_id, "qty": qty, "restaurant_id": restaurant_id}).first() is None:
                name, stock = db.execute(
                    text("SELECT name, stock FROM dishes WHERE id = :d"), {"d": dish_id}
                ).first() or ("An item", 0)
                detail = f"{name} is sold out." if stock == 0 else f"Only {stock} × {name} left in stock."
                raise HTTPException(status.HTTP_409_CONFLICT, detail)
            db.execute(
                text("INSERT INTO inventory_reservations (order_id, dish_id, quantity) VALUES (:o, :d, :q)"),
                {"o": order_id, "d": dish_id, "q": qty},
            )
        db.commit()  # all items reserved together, or none
    except Exception:
        db.rollback()
        raise


def commit(db: Session, order_id: int) -> int:
    count = db.execute(
        text("UPDATE inventory_reservations SET status = 'COMMITTED' WHERE order_id = :o AND status = 'RESERVED'"),
        {"o": order_id},
    ).rowcount
    db.commit()
    return count


def release(db: Session, order_id: int, include_committed: bool = False) -> int:
    statuses = ["RESERVED", "COMMITTED"] if include_committed else ["RESERVED"]
    count = len(db.execute(_RELEASE, {"order_id": order_id, "statuses": statuses}).all())
    db.commit()
    return count
