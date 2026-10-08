"""Authentication use-cases: OTP login, Google login and admin login. All issue a JWT."""
import logging

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from steward_common.activity import log_activity
from steward_common.config import get_settings
from steward_common.security import ROLE_ADMIN, ROLE_USER, create_access_token

from ..core.passwords import verify_password
from ..models.user import User
from ..repositories import user_repository as users
from ..schemas.auth import TokenResponse, UserOut
from . import otp_service, sms_sender

log = logging.getLogger("user-service.auth")

_ADMIN_USE_PASSWORD = "Admin accounts must sign in with email and password."


def _token_response(user: User, *, is_new: bool = False) -> TokenResponse:
    settings = get_settings()
    return TokenResponse(
        access_token=create_access_token(user.id, user.role, user.full_name),
        expires_in=settings.jwt_expire_minutes * 60,
        user=UserOut.model_validate(user),
        is_new_user=is_new,
    )


def _ensure_can_login(user: User) -> None:
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled.")


# ── Mobile OTP ────────────────────────────────────────────────────────
def request_otp(phone: str) -> int:
    otp = otp_service.issue_otp(phone)
    sms_sender.send_otp(phone, otp)
    return get_settings().otp_ttl_seconds


def login_with_otp(db: Session, phone: str, otp: str, full_name: str | None) -> TokenResponse:
    otp_service.verify_otp(phone, otp)  # raises on invalid/expired

    user = users.get_by_phone(db, phone)
    is_new = user is None
    if is_new:
        # Public sign-up can only ever create role=USER.
        user = users.create(db, phone=phone, full_name=full_name, role=ROLE_USER)
    elif user.role == ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, _ADMIN_USE_PASSWORD)
    elif full_name and not user.full_name:
        user.full_name = full_name

    _ensure_can_login(user)
    users.touch_login(user)
    db.commit()
    log_activity(user.id, "LOGIN", method="OTP", new_user=is_new)
    return _token_response(user, is_new=is_new)


# ── Google OAuth (Google Identity Services ID token) ──────────────────
def _verify_google_token(credential: str) -> dict:
    client_id = get_settings().google_client_id
    if not client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured yet.")
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        # Verifies signature (Google's public keys), expiry, issuer and audience.
        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in failed. Please try again.")
    if not claims.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your Google email address is not verified.")
    return claims


def login_with_google(db: Session, credential: str) -> TokenResponse:
    claims = _verify_google_token(credential)
    sub, email = claims["sub"], claims["email"].lower()

    user = users.get_by_google_sub(db, sub)
    is_new = False
    if user is None:
        user = users.get_by_email(db, email)
        if user is not None:
            if user.role == ROLE_ADMIN:
                raise HTTPException(status.HTTP_403_FORBIDDEN, _ADMIN_USE_PASSWORD)
            user.google_sub = sub  # link Google to an existing customer account
        else:
            is_new = True
            user = users.create(
                db, email=email, google_sub=sub, role=ROLE_USER,
                full_name=claims.get("name"), avatar_url=claims.get("picture"),
            )
    if user.role == ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, _ADMIN_USE_PASSWORD)

    _ensure_can_login(user)
    users.touch_login(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This Google account is already linked to another user.")
    log_activity(user.id, "LOGIN", method="GOOGLE", new_user=is_new)
    return _token_response(user, is_new=is_new)


# ── Admin email + password ────────────────────────────────────────────
def login_admin(db: Session, email: str, password: str) -> TokenResponse:
    user = users.get_by_email(db, email)
    # Same message (and same bcrypt cost) whether the email or the password is wrong.
    valid = verify_password(password, user.password_hash if user else None)
    if not valid or user is None or user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    _ensure_can_login(user)
    users.touch_login(user)
    db.commit()
    log.info("Admin %s signed in", user.id)
    return _token_response(user)
