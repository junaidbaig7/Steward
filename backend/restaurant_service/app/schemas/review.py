from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ReviewCreate(BaseModel):
    order_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=5)
    review: str = Field(default="", max_length=1000)

    @field_validator("review")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    review: str | None = Field(default=None, max_length=1000)


class ReviewOut(BaseModel):
    id: str
    user_id: int
    user_name: str
    restaurant_id: int
    restaurant_name: str | None = None
    order_id: int
    rating: int
    review: str
    created_at: datetime
    updated_at: datetime | None = None
