"""Data access for the `users` table. No business rules here — only queries."""
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.user import User


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_by_phone(db: Session, phone: str) -> User | None:
    return db.scalar(select(User).where(User.phone == phone))


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.lower()))


def get_by_google_sub(db: Session, google_sub: str) -> User | None:
    return db.scalar(select(User).where(User.google_sub == google_sub))


def create(db: Session, **fields) -> User:
    user = User(**fields)
    db.add(user)
    db.flush()  # assigns the identity id inside the current transaction
    return user


def touch_login(user: User) -> None:
    user.last_login_at = datetime.now(timezone.utc)


def list_customers(db: Session, limit: int, offset: int) -> tuple[list[User], int]:
    base = select(User).where(User.role == "USER")
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(User.created_at.desc()).limit(limit).offset(offset)).all()
    return list(rows), total or 0
