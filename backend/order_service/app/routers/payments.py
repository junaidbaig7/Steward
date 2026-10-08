from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from steward_common.config import get_settings
from steward_common.postgres import get_db
from steward_common.security import CustomerUser

from ..schemas.order import OrderOut
from ..schemas.payment import CheckoutSession, MockOutcome, PaymentCreate, PaymentFailure, PaymentVerify
from ..services import order_service, payment_service

router = APIRouter(prefix="/payments", tags=["payments"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/config")
def payment_config():
    """Public payment settings for the frontend (key id only — the secret never leaves the server)."""
    s = get_settings()
    mode = "RAZORPAY_TEST" if s.razorpay_enabled else ("MOCK" if s.is_development else "DISABLED")
    return {"mode": mode, "key_id": s.razorpay_key_id if s.razorpay_enabled else None}


@router.post("/create", response_model=CheckoutSession)
def create_payment(body: PaymentCreate, db: DB, user: CustomerUser):
    return payment_service.create_checkout(db, user, body.order_id)


@router.post("/verify", response_model=OrderOut)
def verify_payment(body: PaymentVerify, db: DB, user: CustomerUser):
    order = payment_service.verify(db, user, body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)
    db.refresh(order)
    return order_service.to_out(db, order, viewer=user)


@router.post("/failure", response_model=OrderOut)
def payment_failed(body: PaymentFailure, db: DB, user: CustomerUser):
    order = payment_service.record_failure(db, user, body.razorpay_order_id, body.razorpay_payment_id, body.reason)
    db.refresh(order)
    return order_service.to_out(db, order, viewer=user)


@router.post("/mock/complete", response_model=OrderOut, include_in_schema=False)
def mock_complete(body: MockOutcome, db: DB, user: CustomerUser):
    """DEVELOPMENT ONLY — exists only while Razorpay test keys are not configured."""
    order = payment_service.mock_complete(db, user, body.razorpay_order_id, body.outcome)
    db.refresh(order)
    return order_service.to_out(db, order, viewer=user)
