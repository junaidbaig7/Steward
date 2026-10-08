from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from steward_common.postgres import get_db
from steward_common.security import OptionalUser

from ..schemas.catalog import DishOut
from ..services import recommendation_service

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/similar/{dish_id}")
def similar_dishes(dish_id: int, db: DB, limit: Annotated[int, Query(ge=1, le=12)] = 6):
    """'You may also like' — nearest neighbours of a dish in embedding space (same Veg/Non-Veg type)."""
    items = recommendation_service.similar_to_dish(db, dish_id, limit)
    if items is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dish not found.")
    return {"items": [DishOut.model_validate(d) for d in items]}


@router.get("/for-you")
def for_you(db: DB, user: OptionalUser, limit: Annotated[int, Query(ge=1, le=12)] = 8):
    """Personalised picks from previous orders; popular dishes for guests or new users."""
    reason, items = recommendation_service.for_user(db, user.id if user else None, limit)
    return {"reason": reason, "items": [DishOut.model_validate(d) for d in items]}
