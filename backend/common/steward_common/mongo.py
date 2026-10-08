"""MongoDB client bound to the steward_db database only."""
from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database

from .config import REQUIRED_DB_NAME, get_settings


@lru_cache
def _client() -> MongoClient:
    return MongoClient(get_settings().mongodb_url, serverSelectionTimeoutMS=3000, tz_aware=True)


def get_mongo_db() -> Database:
    name = get_settings().mongodb_db
    if name != REQUIRED_DB_NAME:  # defensive double-check (settings already validate this)
        raise RuntimeError(f"Refusing to use MongoDB database '{name}'.")
    return _client()[name]


def ping_mongo() -> bool:
    try:
        return _client().admin.command("ping").get("ok") == 1
    except Exception:
        return False
