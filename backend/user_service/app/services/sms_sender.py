"""Delivery of OTP codes.

DEVELOPMENT / DEMO BEHAVIOUR: with APP_ENV=development and no SMS provider
configured, the OTP is written to the user-service log so the demo can proceed.
It is NEVER included in an API response. In production, a real provider must be
plugged in here (e.g. MSG91 or Twilio via environment variables); otherwise OTP
requests fail with a clear error instead of silently logging codes.
"""
import logging

from fastapi import HTTPException, status

from steward_common.config import get_settings

log = logging.getLogger("user-service.otp")


def send_otp(phone: str, otp: str) -> None:
    settings = get_settings()
    if settings.is_development:
        masked = phone[:3] + "•" * (len(phone) - 7) + phone[-4:]
        log.warning("[DEV ONLY — not sent by SMS] OTP for %s is %s", masked, otp)
        return
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "SMS delivery is not configured. Please sign in with Google.",
    )
