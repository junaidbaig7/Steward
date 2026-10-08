from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from steward_common.postgres import get_db
from steward_common.security import AdminUser, AuthUser, CustomerUser

from ..repositories import review_repository as repo
from ..schemas.review import ReviewCreate, ReviewOut, ReviewUpdate
from ..services import review_service

router = APIRouter(prefix="/reviews", tags=["reviews"])
DB = Annotated[Session, Depends(get_db)]
Sort = Literal["newest", "highest", "lowest"]


def _page(db: Session, docs: list[dict], total: int) -> dict:
    names = review_service.restaurant_names(db, {d["restaurant_id"] for d in docs})
    return {"total": total, "items": [{**repo.to_out(d), "restaurant_name": names.get(d["restaurant_id"])} for d in docs]}


@router.get("")
def list_reviews(
    db: DB, restaurant_id: int,
    sort: Sort = "newest",
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Public reviews for one restaurant."""
    docs, total = repo.find({"restaurant_id": restaurant_id}, sort=sort, limit=limit, offset=offset)
    return _page(db, docs, total)


@router.get("/restaurants/{restaurant_id}/summary")
def rating_summary(restaurant_id: int):
    """Average, count and 5★…1★ distribution (MongoDB $facet aggregation)."""
    return repo.summary(restaurant_id)


@router.get("/rankings")
def restaurant_rankings(db: DB):
    """Restaurants ranked by weighted (Bayesian) rating — fair to places with few reviews."""
    rows = repo.rankings()
    names = review_service.restaurant_names(db, {r["restaurant_id"] for r in rows})
    return [{**r, "restaurant_name": names.get(r["restaurant_id"])} for r in rows if r["restaurant_id"] in names]


@router.get("/mine")
def my_reviews(db: DB, user: AuthUser, limit: Annotated[int, Query(ge=1, le=50)] = 20):
    docs, total = repo.find({"user_id": user.id}, sort="newest", limit=limit, offset=0)
    return _page(db, docs, total)


@router.get("/orders/{order_id}")
def review_for_order(order_id: int, user: AuthUser):
    doc = repo.for_order(order_id)
    if doc is None or (doc["user_id"] != user.id and not user.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No review for this order yet.")
    return repo.to_out(doc)


@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def create_review(body: ReviewCreate, db: DB, user: CustomerUser):
    return review_service.create(db, user, body)


@router.patch("/{review_id}", response_model=ReviewOut)
def update_review(review_id: str, body: ReviewUpdate, user: CustomerUser):
    return review_service.update(user, review_id, body)


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(review_id: str, user: AuthUser):
    review_service.delete(user, review_id)


# ── Admin ─────────────────────────────────────────────────────────────
@router.get("/admin/all")
def all_reviews(
    db: DB, _: AdminUser,
    restaurant_id: int | None = None,
    rating: Annotated[int | None, Query(ge=1, le=5)] = None,
    sort: Sort = "newest",
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    filters = {k: v for k, v in {"restaurant_id": restaurant_id, "rating": rating}.items() if v is not None}
    docs, total = repo.find(filters, sort=sort, limit=limit, offset=offset)
    return _page(db, docs, total)
