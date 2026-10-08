"""Razorpay checkout signature = HMAC_SHA256(key_secret, "<order_id>|<payment_id>")."""
import hashlib
import hmac

from app.services import razorpay_client


def _settings(secret):
    return type("S", (), {"razorpay_key_secret": secret})()


def test_valid_signature_accepted(monkeypatch):
    monkeypatch.setattr(razorpay_client, "get_settings", lambda: _settings("test_secret"))
    sig = hmac.new(b"test_secret", b"order_ABC|pay_XYZ", hashlib.sha256).hexdigest()
    assert razorpay_client.verify_signature("order_ABC", "pay_XYZ", sig)


def test_tampered_signature_rejected(monkeypatch):
    monkeypatch.setattr(razorpay_client, "get_settings", lambda: _settings("test_secret"))
    sig = hmac.new(b"test_secret", b"order_ABC|pay_XYZ", hashlib.sha256).hexdigest()
    assert not razorpay_client.verify_signature("order_ABC", "pay_OTHER", sig)   # swapped payment id
    assert not razorpay_client.verify_signature("order_ABC", "pay_XYZ", sig[:-1] + "0")
    assert not razorpay_client.verify_signature("order_ABC", "pay_XYZ", "")
