"""JWT issuing/verification and role-based access control (RBAC) dependencies.

Every service verifies the JWT itself (shared secret), so a request that somehow
bypasses the gateway is still authenticated and authorized.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

ROLE_USER = "USER"
ROLE_ADMIN = "ADMIN"

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: int
    role: str
    name: str | None = None

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN


def create_access_token(user_id: int, role: str, name: str | None = None) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "name": name,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        "iss": "steward",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> CurrentUser:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm], issuer="steward"
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token.")
    return CurrentUser(id=int(payload["sub"]), role=payload["role"], name=payload.get("name"))


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in to continue.")
    return decode_access_token(credentials.credentials)


def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser | None:
    if credentials is None:
        return None
    try:
        return decode_access_token(credentials.credentials)
    except HTTPException:
        return None


def require_role(*roles: str):
    """Dependency factory: `Depends(require_role(ROLE_ADMIN))`."""

    def _checker(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this resource.")
        return user

    return _checker


def require_internal_key(x_internal_key: Annotated[str | None, Header()] = None) -> None:
    """Protects service-to-service endpoints (never exposed through the gateway)."""
    expected = get_settings().internal_api_key
    if not expected or x_internal_key != expected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal endpoint.")


# Convenient type aliases for routers
AuthUser = Annotated[CurrentUser, Depends(get_current_user)]
OptionalUser = Annotated[CurrentUser | None, Depends(get_optional_user)]
AdminUser = Annotated[CurrentUser, Depends(require_role(ROLE_ADMIN))]
CustomerUser = Annotated[CurrentUser, Depends(require_role(ROLE_USER))]
