from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

FoodType = Literal["VEG", "NON_VEG"]


# ── Categories ────────────────────────────────────────────────────────
class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


# ── Restaurants ───────────────────────────────────────────────────────
class RestaurantBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    cuisine: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=300)
    city: str = Field(min_length=2, max_length=80)
    phone: str | None = Field(default=None, pattern=r"^\+[1-9]\d{7,14}$")
    image_url: HttpUrl | None = None
    avg_delivery_minutes: int = Field(default=30, ge=5, le=180)
    delivery_fee: float = Field(default=0, ge=0, le=500)
    min_order_amount: float = Field(default=0, ge=0, le=5000)
    is_active: bool = True

    @field_validator("image_url", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        return v or None


class RestaurantCreate(RestaurantBase):
    pass


class RestaurantUpdate(BaseModel):
    """PATCH semantics: only provided fields change."""
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    cuisine: str | None = Field(default=None, min_length=2, max_length=120)
    address: str | None = Field(default=None, min_length=3, max_length=300)
    city: str | None = Field(default=None, min_length=2, max_length=80)
    phone: str | None = Field(default=None, pattern=r"^\+[1-9]\d{7,14}$")
    image_url: HttpUrl | None = None
    avg_delivery_minutes: int | None = Field(default=None, ge=5, le=180)
    delivery_fee: float | None = Field(default=None, ge=0, le=500)
    min_order_amount: float | None = Field(default=None, ge=0, le=5000)
    is_active: bool | None = None


class RestaurantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str
    cuisine: str
    address: str
    city: str
    phone: str | None
    image_url: str | None
    avg_delivery_minutes: int
    delivery_fee: float
    min_order_amount: float
    is_active: bool
    created_at: datetime
    # Aggregates (computed with SQL / MongoDB, not stored)
    dish_count: int = 0
    veg_count: int = 0
    min_price: float | None = None
    avg_rating: float | None = None
    review_count: int = 0


# ── Dishes ────────────────────────────────────────────────────────────
class DishBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    ingredients: str = Field(default="", max_length=500)
    category_id: int
    food_type: FoodType
    spice_level: int = Field(default=0, ge=0, le=3)
    price: float = Field(gt=0, le=10000)
    image_url: HttpUrl | None = None
    is_available: bool = True
    stock: int = Field(default=0, ge=0, le=100000)

    @field_validator("image_url", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        return v or None


class DishCreate(DishBase):
    pass


class DishUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    ingredients: str | None = Field(default=None, max_length=500)
    category_id: int | None = None
    food_type: FoodType | None = None
    spice_level: int | None = Field(default=None, ge=0, le=3)
    price: float | None = Field(default=None, gt=0, le=10000)
    image_url: HttpUrl | None = None
    is_available: bool | None = None
    stock: int | None = Field(default=None, ge=0, le=100000)


class StockUpdate(BaseModel):
    """Either set an absolute stock level or adjust by a delta (e.g. +20 after a delivery)."""
    stock: int | None = Field(default=None, ge=0, le=100000)
    delta: int | None = Field(default=None, ge=-100000, le=100000)


class DishOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    restaurant_id: int
    restaurant_name: str | None = None
    category_id: int
    category: str | None = None
    name: str
    description: str
    ingredients: str
    food_type: FoodType
    spice_level: int
    price: float
    image_url: str | None
    is_available: bool
    stock: int
    in_stock: bool = True
    updated_at: datetime


class Page(BaseModel):
    total: int
    items: list
