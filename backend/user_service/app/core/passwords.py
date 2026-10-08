"""bcrypt password hashing (admins only)."""
import bcrypt

# Used when the email does not exist, so login takes the same time either way
# (prevents discovering valid admin emails through response timing).
_DUMMY_HASH = bcrypt.hashpw(b"steward-dummy-password", bcrypt.gensalt())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    candidate = password.encode()[:72]  # bcrypt's input limit
    if not password_hash:
        bcrypt.checkpw(candidate, _DUMMY_HASH)
        return False
    return bcrypt.checkpw(candidate, password_hash.encode())
