from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from steward_common.postgres import get_db
from steward_common.security import AdminUser, CustomerUser

from ..repositories import analytics_repository as analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/admin/overview")
def admin_overview(db: DB, _: AdminUser):
    """Platform dashboard: KPIs, 30-day trend, status mix, best sellers and latest orders."""
    return {
        "kpis": {**analytics.platform_overview(db), **analytics.catalog_counts(db)},
        "daily": analytics.daily_series(db, 30),
        "status_breakdown": analytics.status_breakdown(db),
        "top_dishes": analytics.top_dishes(db, 5, days=30),
        "recent_orders": analytics.recent_orders(db, 6),
    }


@router.get("/admin/revenue")
def revenue_series(
    db: DB, _: AdminUser,
    granularity: Annotated[str, Query(pattern="^(day|month)$")] = "day",
    days: Annotated[int, Query(ge=7, le=365)] = 30,
    months: Annotated[int, Query(ge=3, le=24)] = 12,
    restaurant_id: int | None = None,
):
    if granularity == "month":
        return analytics.monthly_series(db, months, restaurant_id)
    return analytics.daily_series(db, days, restaurant_id)


@router.get("/admin/restaurants")
def restaurants_performance(db: DB, _: AdminUser):
    return analytics.restaurant_performance(db)


@router.get("/admin/restaurants/{restaurant_id}")
def restaurant_analytics(restaurant_id: int, db: DB, _: AdminUser):
    """Everything about one restaurant: KPIs, trends, best sellers and order mix."""
    top = analytics.top_dishes(db, 8, restaurant_id)
    return {
        "kpis": analytics.platform_overview(db, restaurant_id),
        "daily": analytics.daily_series(db, 30, restaurant_id),
        "monthly": analytics.monthly_series(db, 6, restaurant_id),
        "top_dishes": top,
        "most_popular_dish": top[0] if top else None,
        "status_breakdown": analytics.status_breakdown(db, restaurant_id),
        "recent_orders": analytics.recent_orders(db, 6, restaurant_id),
    }


@router.get("/admin/top-dishes")
def top_dishes(
    db: DB, _: AdminUser,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    restaurant_id: int | None = None,
    days: Annotated[int | None, Query(ge=1, le=365)] = None,
):
    return analytics.top_dishes(db, limit, restaurant_id, days)


@router.get("/me")
def my_analytics(db: DB, user: CustomerUser):
    """Personal dashboard: spending, favourites and a 6-month spending chart."""
    return {
        "summary": analytics.user_summary(db, user.id),
        **analytics.user_favourites(db, user.id),
        "monthly": analytics.user_monthly(db, user.id),
    }

