"""Restaurant & dish management (admin) — validation, slugs and keeping embeddings in sync."""
import logging

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.catalog import Dish, Restaurant
from ..repositories import dish_repository as dishes
from ..repositories import restaurant_repository as restaurants
from ..schemas.catalog import DishCreate, DishUpdate, RestaurantCreate, RestaurantUpdate, StockUpdate
from ..utils.slug import slugify
from .embedding_service import dish_document, embed_text

log = logging.getLogger("restaurant-service.catalog")

# Changing any of these changes what the dish "means", so its embedding is recomputed.
EMBEDDED_FIELDS = {"name", "description", "ingredients", "category_id", "food_type", "spice_level"}


def _not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found.")


def _dump(model) -> dict:
    data = model.model_dump(exclude_unset=True)
    if data.get("image_url") is not None:
        data["image_url"] = str(data["image_url"])
    return data


# ── Restaurants ───────────────────────────────────────────────────────
def _unique_slug(db: Session, name: str) -> str:
    base = slugify(name)
    slug, n = base, 2
    while restaurants.slug_exists(db, slug):
        slug, n = f"{base}-{n}", n + 1
    return slug


def create_restaurant(db: Session, body: RestaurantCreate) -> int:
    restaurant = Restaurant(**_dump(body), slug=_unique_slug(db, body.name))
    db.add(restaurant)
    db.commit()
    log.info("Restaurant %s created (%s)", restaurant.id, restaurant.name)
    return restaurant.id


def update_restaurant(db: Session, restaurant_id: int, body: RestaurantUpdate) -> None:
    restaurant = restaurants.get(db, restaurant_id)
    if restaurant is None:
        raise _not_found("Restaurant")
    changes = _dump(body)
    for field, value in changes.items():
        setattr(restaurant, field, value)
    db.commit()
    # Restaurant name/cuisine are part of each dish's embedding text.
    if {"name", "cuisine"} & changes.keys():
        for dish in restaurant.dishes:
            refresh_embedding(db, dish)
        db.commit()


def delete_restaurant(db: Session, restaurant_id: int) -> None:
    restaurant = restaurants.get(db, restaurant_id)
    if restaurant is None:
        raise _not_found("Restaurant")
    try:
        db.delete(restaurant)  # dishes cascade in PostgreSQL
        db.commit()
    except IntegrityError:
        # orders.restaurant_id is ON DELETE RESTRICT — order history must survive.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This restaurant has order history and cannot be deleted. Deactivate it instead.",
        )


# ── Dishes ────────────────────────────────────────────────────────────
def refresh_embedding(db: Session, dish: Dish) -> None:
    restaurant = restaurants.get(db, dish.restaurant_id)
    dish.embedding = embed_text(dish_document(
        name=dish.name, description=dish.description, ingredients=dish.ingredients,
        category=dishes.category_name(db, dish.category_id) or "", food_type=dish.food_type,
        spice_level=dish.spice_level, restaurant_name=restaurant.name, cuisine=restaurant.cuisine,
    ))


def _check_category(db: Session, category_id: int) -> None:
    if dishes.category_name(db, category_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown category.")


def create_dish(db: Session, restaurant_id: int, body: DishCreate) -> int:
    if restaurants.get(db, restaurant_id) is None:
        raise _not_found("Restaurant")
    _check_category(db, body.category_id)
    if dishes.name_taken(db, restaurant_id, body.name):
        raise HTTPException(status.HTTP_409_CONFLICT, "This restaurant already has a dish with that name.")

    dish = Dish(**_dump(body), restaurant_id=restaurant_id)
    db.add(dish)
    db.flush()
    refresh_embedding(db, dish)  # new dishes are immediately searchable
    db.commit()
    log.info("Dish %s created in restaurant %s", dish.id, restaurant_id)
    return dish.id


def update_dish(db: Session, dish_id: int, body: DishUpdate) -> None:
    dish = dishes.get(db, dish_id)
    if dish is None:
        raise _not_found("Dish")
    changes = _dump(body)
    if "category_id" in changes:
        _check_category(db, changes["category_id"])
    if "name" in changes and dishes.name_taken(db, dish.restaurant_id, changes["name"], exclude_id=dish_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "This restaurant already has a dish with that name.")
    for field, value in changes.items():
        setattr(dish, field, value)
    if EMBEDDED_FIELDS & changes.keys():
        refresh_embedding(db, dish)
    db.commit()


def update_stock(db: Session, dish_id: int, body: StockUpdate) -> None:
    dish = dishes.get(db, dish_id)
    if dish is None:
        raise _not_found("Dish")
    if (body.stock is None) == (body.delta is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide either stock or delta.")
    new_stock = body.stock if body.stock is not None else dish.stock + body.delta
    if new_stock < 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Stock cannot go below zero (currently {dish.stock}).")
    dish.stock = new_stock
    db.commit()


def delete_dish(db: Session, dish_id: int) -> None:
    dish = dishes.get(db, dish_id)
    if dish is None:
        raise _not_found("Dish")
    db.delete(dish)  # past order_items keep their snapshot (dish_id → NULL)
    db.commit()
