from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from steward_common.activity import recent_activity
from steward_common.postgres import get_db
from steward_common.security import AdminUser, AuthUser

from ..repositories import user_repository as users
from ..schemas.auth import ProfileUpdate, UserOut

router = APIRouter(prefix="/users", tags=["users"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/me", response_model=UserOut)
def get_me(current: AuthUser, db: DB):
    user = users.get_by_id(db, current.id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found.")
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, current: AuthUser, db: DB):
    user = users.get_by_id(db, current.id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already used by another account.")
    return user


@router.get("/me/activity")
def my_activity(current: AuthUser, limit: Annotated[int, Query(ge=1, le=100)] = 20):
    """Recent activity events from MongoDB (logins, searches, orders, reviews)."""
    return recent_activity(current.id, limit)


@router.get("", response_model=dict)
def list_customers(
    _: AdminUser, db: DB,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    rows, total = users.list_customers(db, limit, offset)
    return {"total": total, "items": [UserOut.model_validate(u) for u in rows]}
