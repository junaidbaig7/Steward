"""Dish queries with the structured filters shared by menus, browsing and search."""
from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from ..models.catalog import Category, Dish, Restaurant


@dataclass
class DishFilters:
    restaurant_id: int | None = None
    category_id: int | None = None
    food_type: str | None = None          # 'VEG' | 'NON_VEG'
    min_price: float | None = None
    max_price: float | None = None
    max_spice: int | None = None
    min_spice: int | None = None
    available_only: bool = True           # is_available AND stock > 0 AND restaurant active
    search: str | None = None


def base_query() -> Select:
    """Dish joined with its restaurant and category names (one round trip)."""
    return (
        select(Dish, Restaurant.name.label("restaurant_name"), Category.name.label("category"))
        .join(Restaurant, Restaurant.id == Dish.restaurant_id)
        .join(Category, Category.id == Dish.category_id)
    )


def apply_filters(stmt: Select, f: DishFilters) -> Select:
    if f.restaurant_id:
        stmt = stmt.where(Dish.restaurant_id == f.restaurant_id)
    if f.category_id:
        stmt = stmt.where(Dish.category_id == f.category_id)
    if f.food_type:
        stmt = stmt.where(Dish.food_type == f.food_type)
    if f.min_price is not None:
        stmt = stmt.where(Dish.price >= f.min_price)
    if f.max_price is not None:
        stmt = stmt.where(Dish.price <= f.max_price)
    if f.max_spice is not None:
        stmt = stmt.where(Dish.spice_level <= f.max_spice)
    if f.min_spice is not None:
        stmt = stmt.where(Dish.spice_level >= f.min_spice)
    if f.available_only:
        stmt = stmt.where(Dish.is_available.is_(True), Dish.stock > 0, Restaurant.is_active.is_(True))
    if f.search:
        stmt = stmt.where(Dish.name.ilike(f"%{f.search.strip()}%"))
    return stmt


def to_dict(row) -> dict:
    dish, restaurant_name, category = row[0], row[1], row[2]
    data = {c.key: getattr(dish, c.key) for c in Dish.__table__.columns if c.key != "embedding"}
    data.update(restaurant_name=restaurant_name, category=category,
                in_stock=dish.is_available and dish.stock > 0)
    return data


def list_dishes(db: Session, f: DishFilters, *, sort: str, limit: int, offset: int) -> tuple[list[dict], int]:
    stmt = apply_filters(base_query(), f)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = {
        "price_asc": Dish.price.asc(),
        "price_desc": Dish.price.desc(),
        "newest": Dish.created_at.desc(),
        "name": Dish.name.asc(),
    }.get(sort, Category.sort_order.asc())
    rows = db.execute(stmt.order_by(order, Dish.name).limit(limit).offset(offset)).all()
    return [to_dict(r) for r in rows], total or 0


def get_dict(db: Session, dish_id: int) -> dict | None:
    row = db.execute(base_query().where(Dish.id == dish_id)).first()
    return to_dict(row) if row else None


def get_many_dicts(db: Session, dish_ids: list[int]) -> list[dict]:
    if not dish_ids:
        return []
    return [to_dict(r) for r in db.execute(base_query().where(Dish.id.in_(dish_ids))).all()]


def get(db: Session, dish_id: int) -> Dish | None:
    return db.get(Dish, dish_id)


def name_taken(db: Session, restaurant_id: int, name: str, exclude_id: int | None = None) -> bool:
    stmt = select(func.count()).where(Dish.restaurant_id == restaurant_id, func.lower(Dish.name) == name.lower())
    if exclude_id:
        stmt = stmt.where(Dish.id != exclude_id)
    return db.scalar(stmt) > 0


def list_categories(db: Session) -> list[Category]:
    return list(db.scalars(select(Category).order_by(Category.sort_order)).all())


def category_name(db: Session, category_id: int) -> str | None:
    return db.scalar(select(Category.name).where(Category.id == category_id))


def count_dishes(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Dish)) or 0


def category_id_by_name(db: Session, name: str) -> int | None:
    return db.scalar(select(Category.id).where(Category.name == name))
