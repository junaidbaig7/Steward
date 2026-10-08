"""Provision (or reset the password of) the STEWARD admin account.

Admins can never self-register through the API — this script is the only way to
create one. Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD in .env.

Usage:  backend/.venv/bin/python scripts/create_admin.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend" / "common"), str(ROOT / "backend" / "user_service")]

from app.core.passwords import hash_password  # noqa: E402
from app.repositories import user_repository as users  # noqa: E402
from steward_common.config import get_settings  # noqa: E402
from steward_common.postgres import SessionLocal, verify_steward_database  # noqa: E402

MIN_PASSWORD_LENGTH = 10


def main() -> None:
    settings = get_settings()
    email, password = settings.admin_email.strip().lower(), settings.admin_password
    if not email or len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Set ADMIN_EMAIL and ADMIN_PASSWORD (min {MIN_PASSWORD_LENGTH} chars) in .env first.")

    verify_steward_database()
    with SessionLocal() as db:
        admin = users.get_by_email(db, email)
        if admin is None:
            users.create(db, email=email, full_name="STEWARD Admin", role="ADMIN",
                         password_hash=hash_password(password))
            action = "created"
        elif admin.role != "ADMIN":
            sys.exit(f"{email} belongs to a customer account; refusing to promote it automatically.")
        else:
            admin.password_hash = hash_password(password)
            action = "password updated"
        db.commit()
    print(f"✓ Admin {email} {action}. Sign in at /admin/login with the password from .env.")


if __name__ == "__main__":
    main()
