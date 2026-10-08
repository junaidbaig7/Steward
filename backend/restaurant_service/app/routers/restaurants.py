from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from steward_common.postgres import get_db
from steward_common.security import AdminUser, OptionalUser

from ..repositories import dish_repository as dishes
from ..repositories import restaurant_repository as restaurants
from ..repositories.dish_repository import DishFilters
from ..schemas.catalog import DishCreate, DishOut, FoodType, RestaurantCreate, RestaurantOut, RestaurantUpdate
from ..services import catalog_service
from ..services.rating_service import attach_ratings

router = APIRouter(prefix="/restaurants", tags=["restaurants"])
DB = Annotated[Session, Depends(get_db)]


@router.get("")
def list_restaurants(
    db: DB, user: OptionalUser,
    search: str | None = Query(default=None, max_length=80),
    city: str | None = None,
    pure_veg: bool = False,
    include_inactive: bool = False,
    sort: str = Query(default="name", pattern="^(name|rating|delivery_time)$"),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Restaurant listing. Inactive restaurants are visible to admins only."""
    rows, total = restaurants.list_restaurants(
        db, search=search, city=city, pure_veg=pure_veg,
        include_inactive=include_inactive and bool(user and user.is_admin), limit=limit, offset=offset,
    )
    items = attach_ratings([RestaurantOut.model_validate(r) for r in rows])
    if sort == "rating":
        items.sort(key=lambda r: (r.avg_rating or 0, r.review_count), reverse=True)
    elif sort == "delivery_time":
        items.sort(key=lambda r: r.avg_delivery_minutes)
    return {"total": total, "items": items}


@router.get("/{ref}", response_model=RestaurantOut)
def get_restaurant(ref: str, db: DB, user: OptionalUser):
    """Look up by numeric id or by slug (e.g. /restaurants/wok-and-roll)."""
    data = (restaurants.get_with_stats(db, restaurant_id=int(ref)) if ref.isdigit()
            else restaurants.get_with_stats(db, slug=ref))
    if data is None or (not data["is_active"] and not (user and user.is_admin)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found.")
    return attach_ratings([RestaurantOut.model_validate(data)])[0]


@router.get("/{restaurant_id}/dishes")
def restaurant_menu(
    restaurant_id: int, db: DB,
    food_type: FoodType | None = None,
    category_id: int | None = None,
):
    """Full menu including sold-out/unavailable dishes (shown greyed out in the UI)."""
    f = DishFilters(restaurant_id=restaurant_id, food_type=food_type, category_id=category_id, available_only=False)
    rows, total = dishes.list_dishes(db, f, sort="category", limit=500, offset=0)
    return {"total": total, "items": [DishOut.model_validate(r) for r in rows]}


# ── Admin ─────────────────────────────────────────────────────────────
@router.post("", response_model=RestaurantOut, status_code=status.HTTP_201_CREATED)
def create_restaurant(body: RestaurantCreate, db: DB, _: AdminUser):
    new_id = catalog_service.create_restaurant(db, body)
    return RestaurantOut.model_validate(restaurants.get_with_stats(db, restaurant_id=new_id))


@router.patch("/{restaurant_id}", response_model=RestaurantOut)
def update_restaurant(restaurant_id: int, body: RestaurantUpdate, db: DB, _: AdminUser):
    catalog_service.update_restaurant(db, restaurant_id, body)
    return attach_ratings([RestaurantOut.model_validate(restaurants.get_with_stats(db, restaurant_id=restaurant_id))])[0]


@router.delete("/{restaurant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_restaurant(restaurant_id: int, db: DB, _: AdminUser):
    catalog_service.delete_restaurant(db, restaurant_id)


@router.post("/{restaurant_id}/dishes", response_model=DishOut, status_code=status.HTTP_201_CREATED)
def create_dish(restaurant_id: int, body: DishCreate, db: DB, _: AdminUser):
    dish_id = catalog_service.create_dish(db, restaurant_id, body)
    return DishOut.model_validate(dishes.get_dict(db, dish_id))
