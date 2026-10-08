"""Mobile OTP lifecycle in Redis — nothing about OTPs is ever written to PostgreSQL.

Keys (all prefixed `steward:`):
  otp:{phone}           hashed OTP, expires after OTP_TTL_SECONDS (TTL = expiry)
  otp:attempts:{phone}  wrong-guess counter, same TTL; 5 strikes invalidates the code
  otp:cooldown:{phone}  exists for 30 s after sending — blocks rapid resends
  otp:hourly:{phone}    sends in the last hour — max 5
"""
import hashlib
import hmac
import secrets

from fastapi import HTTPException, status

from steward_common.config import get_settings
from steward_common.redis_client import get_redis, key

MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 30
MAX_SENDS_PER_HOUR = 5


def _hash(phone: str, otp: str) -> str:
    # Store only an HMAC of the code, so a Redis dump does not reveal live OTPs.
    secret = get_settings().jwt_secret.encode()
    return hmac.new(secret, f"{phone}:{otp}".encode(), hashlib.sha256).hexdigest()


def issue_otp(phone: str) -> str:
    """Create and store a new OTP. Returns the plain code for delivery."""
    r = get_redis()
    ttl = get_settings().otp_ttl_seconds

    if r.exists(key("otp", "cooldown", phone)):
        wait = r.ttl(key("otp", "cooldown", phone))
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Please wait {wait}s before requesting a new code.")

    hourly_key = key("otp", "hourly", phone)
    sends = r.incr(hourly_key)
    if sends == 1:
        r.expire(hourly_key, 3600)
    if sends > MAX_SENDS_PER_HOUR:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many codes requested. Try again in an hour.")

    otp = f"{secrets.randbelow(1_000_000):06d}"
    # Pipeline = one round trip; SET ... EX sets the value and its TTL atomically.
    pipe = r.pipeline()
    pipe.set(key("otp", phone), _hash(phone, otp), ex=ttl)
    pipe.delete(key("otp", "attempts", phone))
    pipe.set(key("otp", "cooldown", phone), 1, ex=RESEND_COOLDOWN_SECONDS)
    pipe.execute()
    return otp


def verify_otp(phone: str, otp: str) -> None:
    """Raise a user-friendly 400 unless the OTP is valid. Valid codes are deleted (single use)."""
    r = get_redis()
    stored = r.get(key("otp", phone))
    if stored is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This code has expired. Please request a new one.")

    attempts_key = key("otp", "attempts", phone)
    if not hmac.compare_digest(stored, _hash(phone, otp)):
        attempts = r.incr(attempts_key)
        r.expire(attempts_key, max(r.ttl(key("otp", phone)), 1))
        remaining = MAX_ATTEMPTS - attempts
        if remaining <= 0:
            r.delete(key("otp", phone), attempts_key)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Too many incorrect attempts. Please request a new code.")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Incorrect code. {remaining} attempt(s) left.")

    # Success: delete immediately so the same code can never be reused.
    r.delete(key("otp", phone), attempts_key, key("otp", "cooldown", phone))
