from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from steward_common.postgres import get_db

from ..schemas.auth import AdminLogin, GoogleLogin, OtpRequest, OtpRequestResponse, OtpVerify, TokenResponse
from ..services import auth_service
from ..services.otp_service import RESEND_COOLDOWN_SECONDS

router = APIRouter(prefix="/auth", tags=["auth"])
DB = Annotated[Session, Depends(get_db)]


@router.post("/otp/request", response_model=OtpRequestResponse)
def request_otp(body: OtpRequest):
    """Step 1 of mobile login: generate an OTP, store it in Redis with a TTL, and send it."""
    expires_in = auth_service.request_otp(body.phone)
    return OtpRequestResponse(
        message="We've sent a 6-digit code to your phone.",
        phone=body.phone,
        expires_in=expires_in,
        resend_after=RESEND_COOLDOWN_SECONDS,
    )


@router.post("/otp/verify", response_model=TokenResponse)
def verify_otp(body: OtpVerify, db: DB):
    """Step 2: verify the OTP (single use), create the user on first login, and issue a JWT."""
    return auth_service.login_with_otp(db, body.phone, body.otp, body.full_name)


@router.post("/google", response_model=TokenResponse)
def google_login(body: GoogleLogin, db: DB):
    """Exchange a Google ID token for a STEWARD JWT (find-or-create the user)."""
    return auth_service.login_with_google(db, body.credential)


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(body: AdminLogin, db: DB):
    """Admin email + password login. Admin accounts are provisioned by scripts/create_admin.py only."""
    return auth_service.login_admin(db, body.email, body.password)
