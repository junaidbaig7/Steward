from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from steward_common.activity import log_activity
from steward_common.postgres import get_db
from steward_common.security import OptionalUser

from ..schemas.catalog import FoodType
from ..services import search_service

router = APIRouter(tags=["search"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/search")
def semantic_search(
    db: DB,
    user: OptionalUser,
    q: Annotated[str, Query(max_length=200, description="Natural-language request")] = "",
    food_type: FoodType | None = None,
    min_price: Annotated[float | None, Query(ge=0)] = None,
    max_price: Annotated[float | None, Query(ge=0)] = None,
    category_id: int | None = None,
    restaurant_id: int | None = None,
    include_unavailable: bool = False,
    ignore: Annotated[str, Query(description="Detected filters to ignore: price,food_type,spice")] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 24,
):
    """Hybrid natural-language dish search (pgvector + full-text + SQL filters)."""
    q = q.strip()
    if len(q) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tell us a little about what you'd like to eat.")
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Minimum price can't be above maximum price.")

    result = search_service.search(
        db, q, food_type=food_type, min_price=min_price, max_price=max_price, category_id=category_id,
        restaurant_id=restaurant_id, include_unavailable=include_unavailable,
        ignore={s.strip() for s in ignore.split(",") if s.strip()}, limit=limit,
    )
    if user:
        log_activity(user.id, "SEARCH", query=q, results=result["total"])
    return result
