"""Restaurant queries. Menu statistics are aggregated with SQL instead of stored counters."""
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from ..models.catalog import Dish, Restaurant


def _with_menu_stats() -> Select:
    """
    SELECT r.*, COUNT(d.id) AS dish_count,
           COUNT(d.id) FILTER (WHERE d.food_type = 'VEG') AS veg_count,
           MIN(d.price) AS min_price
    FROM restaurants r LEFT JOIN dishes d ON d.restaurant_id = r.id
    GROUP BY r.id
    """
    return (
        select(
            Restaurant,
            func.count(Dish.id).label("dish_count"),
            func.count(Dish.id).filter(Dish.food_type == "VEG").label("veg_count"),
            func.min(Dish.price).label("min_price"),
        )
        .outerjoin(Dish, Dish.restaurant_id == Restaurant.id)
        .group_by(Restaurant.id)
    )


def _to_dict(row) -> dict:
    restaurant, dish_count, veg_count, min_price = row
    data = {c.key: getattr(restaurant, c.key) for c in Restaurant.__table__.columns}
    data.update(dish_count=dish_count, veg_count=veg_count, min_price=min_price)
    return data


def list_restaurants(
    db: Session, *, search: str | None, city: str | None, include_inactive: bool,
    pure_veg: bool, limit: int, offset: int,
) -> tuple[list[dict], int]:
    stmt = _with_menu_stats()
    if not include_inactive:
        stmt = stmt.where(Restaurant.is_active.is_(True))
    if city:
        stmt = stmt.where(func.lower(Restaurant.city) == city.lower())
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Restaurant.name.ilike(like), Restaurant.cuisine.ilike(like)))
    if pure_veg:
        # HAVING: every dish on the menu is vegetarian
        stmt = stmt.having(func.bool_and(Dish.food_type == "VEG"))

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(Restaurant.name).limit(limit).offset(offset)).all()
    return [_to_dict(r) for r in rows], total or 0


def get_with_stats(db: Session, restaurant_id: int | None = None, slug: str | None = None) -> dict | None:
    stmt = _with_menu_stats()
    stmt = stmt.where(Restaurant.id == restaurant_id) if restaurant_id else stmt.where(Restaurant.slug == slug)
    row = db.execute(stmt).first()
    return _to_dict(row) if row else None


def get(db: Session, restaurant_id: int) -> Restaurant | None:
    return db.get(Restaurant, restaurant_id)


def slug_exists(db: Session, slug: str) -> bool:
    return db.scalar(select(func.count()).where(Restaurant.slug == slug)) > 0


def count_active(db: Session) -> int:
    return db.scalar(select(func.count()).where(Restaurant.is_active.is_(True))) or 0
