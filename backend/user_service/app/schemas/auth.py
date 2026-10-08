import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

_PHONE_E164 = re.compile(r"^\+[1-9]\d{7,14}$")


def normalize_phone(value: str) -> str:
    """Accept '98765 43210', '09876543210', '+91 98765-43210' → '+919876543210'."""
    digits = re.sub(r"[\s\-()]", "", value or "")
    if re.fullmatch(r"0?[6-9]\d{9}", digits):  # Indian mobile without country code
        digits = "+91" + digits[-10:]
    elif re.fullmatch(r"91[6-9]\d{9}", digits):
        digits = "+" + digits
    if not _PHONE_E164.match(digits):
        raise ValueError("Enter a valid mobile number")
    return digits


class _HasPhone(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value: str) -> str:
        return normalize_phone(value)


class OtpRequest(_HasPhone):
    pass


class OtpRequestResponse(BaseModel):
    message: str
    phone: str
    expires_in: int
    resend_after: int


class OtpVerify(_HasPhone):
    otp: str = Field(pattern=r"^\d{6}$", description="6-digit code")
    full_name: str | None = Field(default=None, max_length=120)


class GoogleLogin(BaseModel):
    credential: str = Field(min_length=20, description="Google Identity Services ID token")


class AdminLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str | None
    email: str | None
    phone: str | None
    role: str
    avatar_url: str | None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
    is_new_user: bool = False


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
