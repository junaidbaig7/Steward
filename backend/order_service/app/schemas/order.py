from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

OrderStatus = Literal[
    "PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "FAILED"
]


class OrderItemIn(BaseModel):
    dish_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=50)


class OrderCreate(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1, max_length=30)
    delivery_address: str = Field(min_length=10, max_length=300)
    contact_phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ]{10,16}$")
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("items")
    @classmethod
    def _unique_dishes(cls, items: list[OrderItemIn]) -> list[OrderItemIn]:
        if len({i.dish_id for i in items}) != len(items):
            raise ValueError("Each dish should appear only once — adjust its quantity instead")
        return items


class StatusUpdate(BaseModel):
    status: OrderStatus
    note: str | None = Field(default=None, max_length=300)


class CancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    dish_id: int | None
    dish_name: str
    food_type: str
    unit_price: float
    quantity: int


class StatusEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    note: str | None
    created_at: datetime


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    provider: str
    razorpay_order_id: str
    razorpay_payment_id: str | None
    amount: float
    currency: str
    method: str | None
    status: str
    failure_reason: str | None
    created_at: datetime


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    restaurant_id: int
    restaurant_name: str | None = None
    customer_name: str | None = None
    status: str
    subtotal: float
    delivery_fee: float
    tax_amount: float
    total_amount: float
    delivery_address: str
    contact_phone: str | None
    notes: str | None
    cancel_reason: str | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut] = []
    history: list[StatusEventOut] = []
    payments: list[PaymentOut] = []
    payment_status: str | None = None
    can_cancel: bool = False
    next_status: str | None = None
