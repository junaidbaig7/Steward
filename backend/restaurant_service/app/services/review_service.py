"""Review rules: verified purchase (delivered order), one review per order, owner-only edits."""
import logging

import httpx
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError
from sqlalchemy import select
from sqlalchemy.orm import Session

from steward_common.activity import log_activity
from steward_common.config import get_settings
from steward_common.security import CurrentUser

from ..models.catalog import Restaurant
from ..repositories import review_repository as repo
from ..schemas.review import ReviewCreate, ReviewUpdate

log = logging.getLogger("restaurant-service.reviews")


def _check_eligibility(order_id: int, user_id: int) -> int:
    """Ask the Order Service (internal API) whether this user may review this order."""
    s = get_settings()
    try:
        r = httpx.get(
            f"{s.order_service_url}/internal/orders/{order_id}/review-eligibility",
            params={"user_id": user_id}, headers={"x-internal-key": s.internal_api_key}, timeout=4.0,
        )
        r.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Couldn't verify your order right now. Please try again.")
    result = r.json()
    if not result["eligible"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, result["reason"])
    return result["restaurant_id"]


def restaurant_names(db: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    return dict(db.execute(select(Restaurant.id, Restaurant.name).where(Restaurant.id.in_(ids))).all())


def create(db: Session, user: CurrentUser, body: ReviewCreate) -> dict:
    restaurant_id = _check_eligibility(body.order_id, user.id)
    try:
        doc = repo.insert({
            "user_id": user.id,
            "user_name": user.name or "STEWARD customer",
            "restaurant_id": restaurant_id,
            "order_id": body.order_id,
            "rating": body.rating,
            "review": body.review,
        })
    except DuplicateKeyError:  # unique index on order_id
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already reviewed this order. You can edit your review instead.")
    log_activity(user.id, "REVIEW_SUBMITTED", restaurant_id=restaurant_id, order_id=body.order_id, rating=body.rating)
    log.info("Review %s: user %s rated restaurant %s %d★", doc["_id"], user.id, restaurant_id, body.rating)
    return {**repo.to_out(doc), "restaurant_name": restaurant_names(db, {restaurant_id}).get(restaurant_id)}


def update(user: CurrentUser, review_id: str, body: ReviewUpdate) -> dict:
    doc = repo.get(review_id)
    if doc is None or doc["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found.")
    changes = body.model_dump(exclude_unset=True)
    if "review" in changes:
        changes["review"] = (changes["review"] or "").strip()
    return repo.to_out(repo.update(review_id, changes) if changes else doc)


def delete(user: CurrentUser, review_id: str) -> None:
    doc = repo.get(review_id)
    if doc is None or (doc["user_id"] != user.id and not user.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found.")
    repo.delete(review_id)
