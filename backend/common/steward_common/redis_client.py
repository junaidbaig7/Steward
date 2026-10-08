"""Redis client. All STEWARD keys are namespaced with a prefix (default `steward:`)
so they never collide with other data in a shared local Redis."""
from functools import lru_cache

import redis

from .config import get_settings


@lru_cache
def get_redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, decode_responses=True, socket_timeout=3)


def key(*parts: str) -> str:
    """key('otp', '+919999999999') -> 'steward:otp:+919999999999'"""
    return ":".join([get_settings().redis_key_prefix, *parts])


def ping_redis() -> bool:
    try:
        return bool(get_redis().ping())
    except Exception:
        return False
