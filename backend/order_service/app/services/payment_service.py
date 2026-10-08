"""Payments: Razorpay Test Mode, with a clearly separated development mock.

Flow:
  create_checkout ─► Razorpay order (or MOCK in development when keys are absent)
  browser pays in Razorpay Checkout (test card / UPI)
  verify          ─► HMAC signature check ─► payment SUCCESS + order CONFIRMED  (one transaction)
  record_failure  ─► payment FAILED + order FAILED + stock released            (compensation)
"""
import logging
import secrets
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from steward_common.activity import log_activity
from steward_common.config import get_settings
from steward_common.security import CurrentUser

from ..models.order import PLACED, Order, Payment
from ..repositories import order_repository as orders
from ..schemas.payment import CheckoutSession
from . import order_service, razorpay_client

log = logging.getLogger("order-service.payments")


def _payment_by_provider_order(db: Session, razorpay_order_id: str, user: CurrentUser) -> Payment:
    payment = db.scalar(select(Payment).where(Payment.razorpay_order_id == razorpay_order_id).with_for_update())
    if payment is None or payment.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found.")
    return payment


def create_checkout(db: Session, user: CurrentUser, order_id: int) -> CheckoutSession:
    settings = get_settings()
    order: Order | None = orders.get(db, order_id)
    if order is None or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    if order.status != PLACED:
        msg = "This order is already paid." if order.payments and order.payments[-1].status == "SUCCESS" \
            else f"This order is {order.status.lower()} and can't be paid. Please place a new order."
        raise HTTPException(status.HTTP_409_CONFLICT, msg)

    if settings.razorpay_enabled:
        provider = "RAZORPAY"
    elif settings.is_development:
        provider = "MOCK"  # DEVELOPMENT ONLY — used when Razorpay test keys are not configured
    else:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Online payments are not configured.")

    amount_paise = int((Decimal(order.total_amount) * 100).to_integral_value())
    payment = next((p for p in order.payments if p.status == "PENDING" and p.provider == provider), None)
    if payment is None:  # reuse a pending attempt so retries don't create duplicate gateway orders
        if provider == "RAZORPAY":
            rz = razorpay_client.create_order(
                amount_paise, receipt=f"steward_order_{order.id}", notes={"steward_order_id": str(order.id)}
            )
            gateway_order_id = rz["id"]
        else:
            gateway_order_id = f"mock_order_{secrets.token_hex(8)}"
        payment = Payment(
            order_id=order.id, user_id=user.id, provider=provider, razorpay_order_id=gateway_order_id,
            amount=order.total_amount, currency="INR", status="PENDING",
        )
        db.add(payment)
        db.commit()
        log.info("Payment %s created for order %s via %s", payment.id, order.id, provider)

    return CheckoutSession(
        payment_id=payment.id, provider=provider,
        key_id=settings.razorpay_key_id if provider == "RAZORPAY" else None,
        razorpay_order_id=payment.razorpay_order_id, amount=amount_paise, currency="INR", order_id=order.id,
        description=f"Order #{order.id}", prefill={"contact": order.contact_phone or "", "name": user.name or ""},
    )


def _mark_success(db: Session, payment: Payment, gateway_payment_id: str, signature: str | None, method: str | None) -> Order:
    order = orders.get_for_update(db, payment.order_id)  # lock order + payment together
    payment.razorpay_payment_id = gateway_payment_id
    payment.razorpay_signature = signature
    payment.method = method
    payment.status = "SUCCESS"
    if order.status != PLACED:
        # Paid after the order had already expired/failed → money must go back.
        payment.failure_reason = "Order was no longer open when payment arrived — refund required"
        db.commit()
        log.warning("Late payment %s for %s order %s", gateway_payment_id, order.status, order.id)
        raise HTTPException(status.HTTP_409_CONFLICT, "Your order had expired before payment completed. The amount will be refunded.")
    via = {"MOCK": "development mock payment"}.get(payment.provider, f"Razorpay ({method or 'online'})")
    order_service.confirm_paid(db, order.id, f"Payment received via {via}")  # commits both rows
    log_activity(payment.user_id, "PAYMENT_SUCCESS", order_id=order.id, amount=float(payment.amount), provider=payment.provider)
    return order


def verify(db: Session, user: CurrentUser, razorpay_order_id: str, razorpay_payment_id: str, signature: str) -> Order:
    payment = _payment_by_provider_order(db, razorpay_order_id, user)
    if payment.status == "SUCCESS":
        return orders.get(db, payment.order_id)  # idempotent: already verified
    if payment.provider != "RAZORPAY":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This payment is not a Razorpay payment.")

    if not razorpay_client.verify_signature(razorpay_order_id, razorpay_payment_id, signature):
        log.warning("Signature mismatch for payment %s (order %s)", payment.id, payment.order_id)
        record_failure(db, user, razorpay_order_id, razorpay_payment_id, "Payment signature verification failed")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "We couldn't verify this payment. No money has been captured for this order.")

    method = razorpay_client.fetch_payment_method(razorpay_payment_id)
    return _mark_success(db, payment, razorpay_payment_id, signature, method)


def record_failure(db: Session, user: CurrentUser, razorpay_order_id: str, gateway_payment_id: str | None, reason: str | None) -> Order:
    """Payment failed → payment FAILED, order FAILED and reserved stock released (Saga compensation)."""
    payment = _payment_by_provider_order(db, razorpay_order_id, user)
    if payment.status == "SUCCESS":
        raise HTTPException(status.HTTP_409_CONFLICT, "This payment already succeeded.")
    payment.status = "FAILED"
    payment.razorpay_payment_id = payment.razorpay_payment_id or gateway_payment_id
    payment.failure_reason = (reason or "Payment failed")[:300]
    order = order_service.fail_unpaid(db, payment.order_id, f"Payment failed: {payment.failure_reason}")
    log_activity(user.id, "PAYMENT_FAILED", order_id=payment.order_id, reason=payment.failure_reason)
    return order


def mock_complete(db: Session, user: CurrentUser, razorpay_order_id: str, outcome: str) -> Order:
    """DEVELOPMENT ONLY: simulate the gateway when Razorpay test keys are absent."""
    settings = get_settings()
    if settings.razorpay_enabled or not settings.is_development:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    payment = _payment_by_provider_order(db, razorpay_order_id, user)
    if payment.provider != "MOCK":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a mock payment.")
    if payment.status == "SUCCESS":
        return orders.get(db, payment.order_id)
    if outcome == "failure":
        return record_failure(db, user, razorpay_order_id, None, "Simulated failure (development mock)")
    return _mark_success(db, payment, f"mock_pay_{secrets.token_hex(8)}", None, "mock")
