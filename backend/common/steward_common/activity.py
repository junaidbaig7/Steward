"""User activity stream in MongoDB (`user_activity` collection).

Flexible, schema-less events (login, search, order, review…) are a natural fit for
MongoDB. Logging is best-effort: an activity failure never breaks the user's request.
A TTL index expires events after 180 days.
"""
import logging
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from pymongo import DESCENDING

from .mongo import get_mongo_db

log = logging.getLogger("steward.activity")

ACTIVITY_TTL_SECONDS = 180 * 24 * 3600


@lru_cache
def _collection():
    coll = get_mongo_db()["user_activity"]
    coll.create_index([("user_id", 1), ("created_at", DESCENDING)], name="user_recent")
    coll.create_index([("type", 1), ("created_at", DESCENDING)], name="type_recent")
    coll.create_index("created_at", expireAfterSeconds=ACTIVITY_TTL_SECONDS, name="ttl_180d")
    return coll


def log_activity(user_id: int | None, event_type: str, **details: Any) -> None:
    if user_id is None:
        return
    try:
        _collection().insert_one({
            "user_id": user_id,
            "type": event_type,
            "details": details,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:  # pragma: no cover - logging must never break requests
        log.warning("Could not record activity %s for user %s", event_type, user_id, exc_info=True)


def recent_activity(user_id: int, limit: int = 20) -> list[dict]:
    cursor = _collection().find({"user_id": user_id}, {"_id": 0}).sort("created_at", DESCENDING).limit(limit)
    return list(cursor)
