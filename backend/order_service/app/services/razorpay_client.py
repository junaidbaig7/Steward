"""Minimal Razorpay REST client (Test Mode). Using the REST API directly keeps the
flow explicit: create an order, then verify the checkout signature with HMAC-SHA256.

Docs: https://razorpay.com/docs/api/orders/ and payment signature verification.
The key secret never leaves the backend.
"""
import hashlib
import hmac
import logging

import httpx
from fastapi import HTTPException, status

from steward_common.config import get_settings

log = logging.getLogger("order-service.razorpay")
API = "https://api.razorpay.com/v1"


def _auth() -> tuple[str, str]:
    s = get_settings()
    return s.razorpay_key_id, s.razorpay_key_secret


def create_order(amount_paise: int, receipt: str, notes: dict) -> dict:
    """POST /v1/orders → {'id': 'order_XXXX', 'amount': ..., 'status': 'created'}"""
    try:
        r = httpx.post(
            f"{API}/orders", auth=_auth(), timeout=10.0,
            json={"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes},
        )
    except httpx.HTTPError:
        log.exception("Razorpay unreachable")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payment gateway is unreachable. Please try again.")
    if r.status_code != 200:
        log.error("Razorpay order creation failed: %s %s", r.status_code, r.text[:300])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not start the payment. Please try again.")
    return r.json()


def fetch_payment_method(payment_id: str) -> str | None:
    """Best-effort lookup of how the customer paid (card / upi / netbanking / wallet)."""
    try:
        r = httpx.get(f"{API}/payments/{payment_id}", auth=_auth(), timeout=5.0)
        return r.json().get("method") if r.status_code == 200 else None
    except httpx.HTTPError:
        return None


def verify_signature(razorpay_order_id: str, razorpay_payment_id: str, signature: str) -> bool:
    """signature == HMAC_SHA256(key_secret, "<order_id>|<payment_id>")"""
    secret = get_settings().razorpay_key_secret.encode()
    expected = hmac.new(secret, f"{razorpay_order_id}|{razorpay_payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")
