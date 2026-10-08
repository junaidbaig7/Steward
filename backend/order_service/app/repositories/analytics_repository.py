"""Analytics queries — aggregation is done by PostgreSQL, not in Python.

Techniques used (useful for the viva):
  • FILTER (WHERE …)        conditional aggregates for many KPIs in one scan
  • date_trunc / generate_series   gap-free time series (days with no orders → 0)
  • CTEs (WITH …)           readable multi-step queries
  • Window functions        RANK(), DENSE_RANK(), SUM() OVER (), LAG(), ROW_NUMBER()
  • JOIN + GROUP BY         per-restaurant / per-dish rollups

"Revenue" counts paid orders only: CONFIRMED → DELIVERED (not PLACED/FAILED/CANCELLED).
Times are bucketed in Asia/Kolkata so "today" matches the business day in India.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

PAID = "('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')"
TZ = "Asia/Kolkata"
LOCAL_NOW = f"(now() AT TIME ZONE '{TZ}')"
LOCAL_TS = f"(o.created_at AT TIME ZONE '{TZ}')"


def _rows(db: Session, sql: str, **params) -> list[dict]:
    return [dict(r._mapping) for r in db.execute(text(sql), params)]


def _one(db: Session, sql: str, **params) -> dict:
    return dict(db.execute(text(sql), params).one()._mapping)


# ── Platform KPIs ─────────────────────────────────────────────────────
def platform_overview(db: Session, restaurant_id: int | None = None) -> dict:
    """All headline numbers in a single pass over orders using FILTER clauses."""
    return _one(db, f"""
        WITH paid AS (
            SELECT o.total_amount, {LOCAL_TS} AS ts
            FROM orders o
            WHERE o.status IN {PAID} AND (CAST(:rid AS BIGINT) IS NULL OR o.restaurant_id = :rid)
        )
        SELECT
            COALESCE(SUM(total_amount), 0)                                                          AS total_revenue,
            COALESCE(SUM(total_amount) FILTER (WHERE ts::date = {LOCAL_NOW}::date), 0)               AS today_revenue,
            COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('month', ts) = date_trunc('month', {LOCAL_NOW})), 0) AS month_revenue,
            COALESCE(SUM(total_amount) FILTER (
                WHERE date_trunc('month', ts) = date_trunc('month', {LOCAL_NOW}) - INTERVAL '1 month'), 0) AS prev_month_revenue,
            -- same days of last month (fair month-to-date comparison)
            COALESCE(SUM(total_amount) FILTER (
                WHERE ts >= date_trunc('month', {LOCAL_NOW}) - INTERVAL '1 month'
                  AND ts <  {LOCAL_NOW} - INTERVAL '1 month'), 0)                                 AS prev_month_to_date_revenue,
            COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('year', ts) = date_trunc('year', {LOCAL_NOW})), 0)   AS year_revenue,
            COUNT(*)                                                                                AS total_orders,
            COUNT(*) FILTER (WHERE ts::date = {LOCAL_NOW}::date)                                     AS today_orders,
            COUNT(*) FILTER (WHERE date_trunc('month', ts) = date_trunc('month', {LOCAL_NOW}))      AS month_orders,
            COALESCE(ROUND(AVG(total_amount), 2), 0)                                                AS avg_order_value
        FROM paid
    """, rid=restaurant_id)


def catalog_counts(db: Session) -> dict:
    """Read-only counts from catalog/user tables for the dashboard header."""
    return _one(db, """
        SELECT (SELECT COUNT(*) FROM restaurants WHERE is_active)                AS active_restaurants,
               (SELECT COUNT(*) FROM restaurants)                                AS total_restaurants,
               (SELECT COUNT(*) FROM dishes)                                     AS total_dishes,
               (SELECT COUNT(*) FROM dishes WHERE is_available AND stock > 0)    AS orderable_dishes,
               (SELECT COUNT(*) FROM dishes WHERE stock BETWEEN 1 AND 5)         AS low_stock_dishes,
               (SELECT COUNT(*) FROM users WHERE role = 'USER')                  AS customers
    """)


def status_breakdown(db: Session, restaurant_id: int | None = None) -> list[dict]:
    return _rows(db, """
        SELECT status, COUNT(*) AS orders
        FROM orders
        WHERE CAST(:rid AS BIGINT) IS NULL OR restaurant_id = :rid
        GROUP BY status ORDER BY orders DESC
    """, rid=restaurant_id)


# ── Time series ───────────────────────────────────────────────────────
def daily_series(db: Session, days: int, restaurant_id: int | None = None) -> list[dict]:
    """generate_series builds every calendar day so the chart has no gaps."""
    return _rows(db, f"""
        WITH days AS (
            SELECT generate_series({LOCAL_NOW}::date - (:days - 1), {LOCAL_NOW}::date, INTERVAL '1 day')::date AS day
        ),
        paid AS (
            SELECT {LOCAL_TS}::date AS day, o.total_amount
            FROM orders o
            WHERE o.status IN {PAID}
              AND o.created_at >= now() - make_interval(days => :days + 1)
              AND (CAST(:rid AS BIGINT) IS NULL OR o.restaurant_id = :rid)
        )
        SELECT d.day,
               COALESCE(SUM(p.total_amount), 0) AS revenue,
               COUNT(p.total_amount)            AS orders
        FROM days d LEFT JOIN paid p ON p.day = d.day
        GROUP BY d.day ORDER BY d.day
    """, days=days, rid=restaurant_id)


def monthly_series(db: Session, months: int, restaurant_id: int | None = None) -> list[dict]:
    """Monthly revenue with month-over-month growth via LAG()."""
    return _rows(db, f"""
        WITH months AS (
            SELECT generate_series(date_trunc('month', {LOCAL_NOW}) - make_interval(months => :months - 1),
                                   date_trunc('month', {LOCAL_NOW}), INTERVAL '1 month') AS month
        ),
        totals AS (
            SELECT m.month,
                   COALESCE(SUM(o.total_amount), 0) AS revenue,
                   COUNT(o.id)                      AS orders
            FROM months m
            LEFT JOIN orders o
                   ON date_trunc('month', {LOCAL_TS}) = m.month
                  AND o.status IN {PAID}
                  AND (CAST(:rid AS BIGINT) IS NULL OR o.restaurant_id = :rid)
            GROUP BY m.month
        )
        SELECT to_char(month, 'YYYY-MM') AS month,
               revenue,
               orders,
               ROUND(100.0 * (revenue - LAG(revenue) OVER w) / NULLIF(LAG(revenue) OVER w, 0), 1) AS growth_pct
        FROM totals
        WINDOW w AS (ORDER BY month)
        ORDER BY month
    """, months=months, rid=restaurant_id)


# ── Rankings ──────────────────────────────────────────────────────────
def top_dishes(db: Session, limit: int, restaurant_id: int | None = None, days: int | None = None) -> list[dict]:
    """Best sellers by quantity, ranked with RANK() (ties share a rank)."""
    return _rows(db, f"""
        SELECT oi.dish_name,
               oi.food_type,
               r.name                                      AS restaurant_name,
               SUM(oi.quantity)                            AS quantity,
               SUM(oi.quantity * oi.unit_price)            AS revenue,
               COUNT(DISTINCT o.id)                        AS orders,
               RANK() OVER (ORDER BY SUM(oi.quantity) DESC) AS rank
        FROM order_items oi
        JOIN orders o      ON o.id = oi.order_id
        JOIN restaurants r ON r.id = o.restaurant_id
        WHERE o.status IN {PAID}
          AND (CAST(:rid AS BIGINT) IS NULL OR o.restaurant_id = :rid)
          AND (CAST(:days AS INT) IS NULL OR o.created_at >= now() - make_interval(days => :days))
        GROUP BY oi.dish_name, oi.food_type, r.name
        ORDER BY quantity DESC, revenue DESC
        LIMIT :limit
    """, limit=limit, rid=restaurant_id, days=days)


def restaurant_performance(db: Session) -> list[dict]:
    """Per-restaurant revenue, share of platform revenue (SUM() OVER ()) and DENSE_RANK()."""
    return _rows(db, f"""
        WITH per_restaurant AS (
            SELECT r.id AS restaurant_id, r.name, r.is_active,
                   COUNT(o.id)                                   AS orders,
                   COALESCE(SUM(o.total_amount), 0)              AS revenue,
                   COALESCE(ROUND(AVG(o.total_amount), 2), 0)    AS avg_order_value,
                   COALESCE(SUM(o.total_amount) FILTER (
                       WHERE date_trunc('month', {LOCAL_TS}) = date_trunc('month', {LOCAL_NOW})), 0) AS month_revenue,
                   COUNT(DISTINCT o.user_id)                     AS customers
            FROM restaurants r
            LEFT JOIN orders o ON o.restaurant_id = r.id AND o.status IN {PAID}
            GROUP BY r.id, r.name, r.is_active
        )
        SELECT *,
               ROUND(100.0 * revenue / NULLIF(SUM(revenue) OVER (), 0), 1) AS revenue_share_pct,
               DENSE_RANK() OVER (ORDER BY revenue DESC)                   AS revenue_rank
        FROM per_restaurant
        ORDER BY revenue DESC
    """)


def recent_orders(db: Session, limit: int, restaurant_id: int | None = None) -> list[dict]:
    return _rows(db, """
        SELECT o.id, o.status, o.total_amount, o.created_at, r.name AS restaurant_name,
               COALESCE(u.full_name, u.phone, u.email) AS customer_name
        FROM orders o
        JOIN restaurants r ON r.id = o.restaurant_id
        JOIN users u ON u.id = o.user_id
        WHERE CAST(:rid AS BIGINT) IS NULL OR o.restaurant_id = :rid
        ORDER BY o.created_at DESC
        LIMIT :limit
    """, limit=limit, rid=restaurant_id)


# ── Customer analytics ────────────────────────────────────────────────
def user_summary(db: Session, user_id: int) -> dict:
    return _one(db, f"""
        SELECT COUNT(*)                                                          AS total_orders,
               COALESCE(SUM(o.total_amount), 0)                                  AS total_spent,
               COALESCE(SUM(o.total_amount) FILTER (
                   WHERE date_trunc('month', {LOCAL_TS}) = date_trunc('month', {LOCAL_NOW})), 0) AS this_month,
               COALESCE(SUM(o.total_amount) FILTER (
                   WHERE date_trunc('month', {LOCAL_TS}) = date_trunc('month', {LOCAL_NOW}) - INTERVAL '1 month'), 0) AS last_month,
               COALESCE(ROUND(AVG(o.total_amount), 2), 0)                        AS avg_order_value,
               MIN(o.created_at)                                                 AS first_order_at
        FROM orders o
        WHERE o.user_id = :uid AND o.status IN {PAID}
    """, uid=user_id)


def user_favourites(db: Session, user_id: int) -> dict:
    """Most-ordered dish and restaurant using ROW_NUMBER() to pick the top row per category."""
    dish = db.execute(text(f"""
        SELECT dish_name, food_type, quantity FROM (
            SELECT oi.dish_name, oi.food_type, SUM(oi.quantity) AS quantity,
                   ROW_NUMBER() OVER (ORDER BY SUM(oi.quantity) DESC, MAX(o.created_at) DESC) AS rn
            FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE o.user_id = :uid AND o.status IN {PAID}
            GROUP BY oi.dish_name, oi.food_type
        ) ranked WHERE rn = 1
    """), {"uid": user_id}).first()
    restaurant = db.execute(text(f"""
        SELECT restaurant_id, name, orders FROM (
            SELECT r.id AS restaurant_id, r.name, COUNT(*) AS orders,
                   ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, MAX(o.created_at) DESC) AS rn
            FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
            WHERE o.user_id = :uid AND o.status IN {PAID}
            GROUP BY r.id, r.name
        ) ranked WHERE rn = 1
    """), {"uid": user_id}).first()
    return {
        "favourite_dish": dict(dish._mapping) if dish else None,
        "favourite_restaurant": dict(restaurant._mapping) if restaurant else None,
    }


def user_monthly(db: Session, user_id: int, months: int = 6) -> list[dict]:
    """The customer's spending per month (gap-free) for the spending chart."""
    return _rows(db, f"""
        WITH months AS (
            SELECT generate_series(date_trunc('month', {LOCAL_NOW}) - make_interval(months => :months - 1),
                                   date_trunc('month', {LOCAL_NOW}), INTERVAL '1 month') AS month
        )
        SELECT to_char(m.month, 'YYYY-MM')     AS month,
               COALESCE(SUM(o.total_amount), 0) AS spent,
               COUNT(o.id)                      AS orders
        FROM months m
        LEFT JOIN orders o
               ON date_trunc('month', {LOCAL_TS}) = m.month
              AND o.user_id = :uid AND o.status IN {PAID}
        GROUP BY m.month ORDER BY m.month
    """, uid=user_id, months=months)
