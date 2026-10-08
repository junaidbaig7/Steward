from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from steward_common.postgres import get_db
from steward_common.security import AdminUser

from ..repositories import dish_repository as dishes
from ..repositories.dish_repository import DishFilters
from ..schemas.catalog import CategoryOut, DishOut, DishUpdate, FoodType, StockUpdate
from ..services import catalog_service

router = APIRouter(tags=["dishes"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: DB):
    return dishes.list_categories(db)


@router.get("/dishes")
def browse_dishes(
    db: DB,
    food_type: FoodType | None = None,
    category_id: int | None = None,
    restaurant_id: int | None = None,
    min_price: Annotated[float | None, Query(ge=0)] = None,
    max_price: Annotated[float | None, Query(ge=0)] = None,
    search: str | None = Query(default=None, max_length=80),
    include_unavailable: bool = False,
    sort: str = Query(default="category", pattern="^(category|price_asc|price_desc|newest|name)$"),
    limit: Annotated[int, Query(ge=1, le=200)] = 24,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Browse dishes across restaurants with structured filters (Veg/Non-Veg, price, category…)."""
    f = DishFilters(
        restaurant_id=restaurant_id, category_id=category_id, food_type=food_type, min_price=min_price,
        max_price=max_price, search=search, available_only=not include_unavailable,
    )
    rows, total = dishes.list_dishes(db, f, sort=sort, limit=limit, offset=offset)
    return {"total": total, "items": [DishOut.model_validate(r) for r in rows]}


@router.get("/dishes/{dish_id}", response_model=DishOut)
def get_dish(dish_id: int, db: DB):
    data = dishes.get_dict(db, dish_id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dish not found.")
    return data


# ── Admin ─────────────────────────────────────────────────────────────
@router.patch("/dishes/{dish_id}", response_model=DishOut)
def update_dish(dish_id: int, body: DishUpdate, db: DB, _: AdminUser):
    catalog_service.update_dish(db, dish_id, body)
    return dishes.get_dict(db, dish_id)


@router.patch("/dishes/{dish_id}/stock", response_model=DishOut)
def update_stock(dish_id: int, body: StockUpdate, db: DB, _: AdminUser):
    catalog_service.update_stock(db, dish_id, body)
    return dishes.get_dict(db, dish_id)


@router.delete("/dishes/{dish_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dish(dish_id: int, db: DB, _: AdminUser):
    catalog_service.delete_dish(db, dish_id)
