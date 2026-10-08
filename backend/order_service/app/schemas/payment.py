from typing import Literal

from pydantic import BaseModel, Field


class PaymentCreate(BaseModel):
    order_id: int


class CheckoutSession(BaseModel):
    """Everything the browser needs to open Razorpay Checkout — never the secret."""
    payment_id: int
    provider: Literal["RAZORPAY", "MOCK"]
    key_id: str | None
    razorpay_order_id: str
    amount: int = Field(description="Amount in paise")
    currency: str
    order_id: int
    name: str = "STEWARD"
    description: str
    prefill: dict


class PaymentVerify(BaseModel):
    razorpay_order_id: str = Field(max_length=64)
    razorpay_payment_id: str = Field(max_length=64)
    razorpay_signature: str = Field(max_length=128)


class PaymentFailure(BaseModel):
    razorpay_order_id: str = Field(max_length=64)
    razorpay_payment_id: str | None = Field(default=None, max_length=64)
    reason: str | None = Field(default=None, max_length=300)


class MockOutcome(BaseModel):
    razorpay_order_id: str = Field(max_length=64)
    outcome: Literal["success", "failure"]
