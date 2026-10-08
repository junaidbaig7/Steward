"""MongoDB access for the `reviews` collection (database: steward_db).

Document shape:
  { _id, user_id, user_name, restaurant_id, order_id, rating (1-5), review, created_at, updated_at }

Why MongoDB? Reviews are append-heavy, free-form documents that are read per
restaurant and aggregated — a natural document-store workload, kept out of the
transactional PostgreSQL schema.
"""
from datetime import datetime, timezone
from functools import lru_cache

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.collection import Collection

from steward_common.mongo import get_mongo_db

# Weighted (Bayesian) rating: shrinks restaurants with few reviews toward the global mean.
RANKING_MIN_REVIEWS = 5


@lru_cache
def reviews() -> Collection:
    coll = get_mongo_db()["reviews"]
    coll.create_index("order_id", unique=True, name="one_review_per_order")
    coll.create_index([("restaurant_id", ASCENDING), ("created_at", DESCENDING)], name="restaurant_recent")
    coll.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_recent")
    return coll


def to_out(doc: dict) -> dict:
    return {**{k: v for k, v in doc.items() if k != "_id"}, "id": str(doc["_id"])}


def _oid(review_id: str) -> ObjectId | None:
    try:
        return ObjectId(review_id)
    except (InvalidId, TypeError):
        return None


def insert(doc: dict) -> dict:
    now = datetime.now(timezone.utc)
    doc = {**doc, "created_at": now, "updated_at": None}
    doc["_id"] = reviews().insert_one(doc).inserted_id
    return doc


def get(review_id: str) -> dict | None:
    oid = _oid(review_id)
    return reviews().find_one({"_id": oid}) if oid else None


def update(review_id: str, changes: dict) -> dict | None:
    return reviews().find_one_and_update(
        {"_id": _oid(review_id)},
        {"$set": {**changes, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )


def delete(review_id: str) -> bool:
    return reviews().delete_one({"_id": _oid(review_id)}).deleted_count == 1


def find(filters: dict, *, sort: str, limit: int, offset: int) -> tuple[list[dict], int]:
    order = {
        "newest": [("created_at", DESCENDING)],
        "highest": [("rating", DESCENDING), ("created_at", DESCENDING)],
        "lowest": [("rating", ASCENDING), ("created_at", DESCENDING)],
    }[sort]
    cursor = reviews().find(filters).sort(order).skip(offset).limit(limit)
    return list(cursor), reviews().count_documents(filters)


def for_order(order_id: int) -> dict | None:
    return reviews().find_one({"order_id": order_id})


def summary(restaurant_id: int) -> dict:
    """One aggregation, two results via $facet: overall stats + 1–5★ distribution."""
    pipeline = [
        {"$match": {"restaurant_id": restaurant_id}},
        {"$facet": {
            "stats": [{"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}}],
            "distribution": [{"$group": {"_id": "$rating", "count": {"$sum": 1}}}],
        }},
    ]
    result = next(reviews().aggregate(pipeline))
    stats = result["stats"][0] if result["stats"] else {"avg": None, "count": 0}
    dist = {str(n): 0 for n in range(5, 0, -1)}
    for d in result["distribution"]:
        dist[str(d["_id"])] = d["count"]
    return {
        "restaurant_id": restaurant_id,
        "avg_rating": round(stats["avg"], 1) if stats["avg"] is not None else None,
        "review_count": stats["count"],
        "distribution": dist,
    }


def rankings() -> list[dict]:
    """
    Weighted rating  WR = (v / (v + m)) · R  +  (m / (v + m)) · C
      R = restaurant average, v = its review count,
      C = average over all reviews, m = RANKING_MIN_REVIEWS.
    """
    m = RANKING_MIN_REVIEWS
    pipeline = [
        {"$group": {"_id": "$restaurant_id", "R": {"$avg": "$rating"}, "v": {"$sum": 1},
                    "positive": {"$sum": {"$cond": [{"$gte": ["$rating", 4]}, 1, 0]}}}},
        {"$setWindowFields": {"output": {
            "total_sum": {"$sum": {"$multiply": ["$R", "$v"]}},
            "total_v": {"$sum": "$v"},
        }}},
        {"$set": {"C": {"$divide": ["$total_sum", "$total_v"]}}},
        {"$set": {"score": {"$add": [
            {"$multiply": [{"$divide": ["$v", {"$add": ["$v", m]}]}, "$R"]},
            {"$multiply": [{"$divide": [m, {"$add": ["$v", m]}]}, "$C"]},
        ]}}},
        {"$sort": {"score": -1}},
        {"$project": {"_id": 0, "restaurant_id": "$_id", "avg_rating": {"$round": ["$R", 2]},
                      "review_count": "$v", "weighted_score": {"$round": ["$score", 3]},
                      "positive_share": {"$round": [{"$divide": ["$positive", "$v"]}, 2]}}},
    ]
    return list(reviews().aggregate(pipeline))
