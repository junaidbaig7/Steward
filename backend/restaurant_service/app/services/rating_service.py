"""Restaurant rating statistics, aggregated from MongoDB reviews."""
from steward_common.mongo import get_mongo_db

from ..schemas.catalog import RestaurantOut


def rating_stats(restaurant_ids: list[int]) -> dict[int, dict]:
    """
    db.reviews.aggregate([
      { $match: { restaurant_id: { $in: [...] } } },
      { $group: { _id: "$restaurant_id", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
    ])
    """
    if not restaurant_ids:
        return {}
    pipeline = [
        {"$match": {"restaurant_id": {"$in": restaurant_ids}}},
        {"$group": {"_id": "$restaurant_id", "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}},
    ]
    try:
        return {doc["_id"]: doc for doc in get_mongo_db()["reviews"].aggregate(pipeline)}
    except Exception:
        return {}  # ratings are optional decoration; never fail a listing because of them


def attach_ratings(items: list[RestaurantOut]) -> list[RestaurantOut]:
    stats = rating_stats([r.id for r in items])
    for r in items:
        if s := stats.get(r.id):
            r.avg_rating = round(s["avg"], 1)
            r.review_count = s["count"]
    return items
