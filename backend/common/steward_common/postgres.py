"""SQLAlchemy engine/session factory with a guard that we are connected to steward_db."""
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import REQUIRED_DB_NAME, get_settings


class Base(DeclarativeBase):
    """Declarative base shared by all STEWARD SQLAlchemy models."""


engine = create_engine(get_settings().postgres_url, pool_pre_ping=True, pool_size=5, max_overflow=5)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_steward_database() -> str:
    """Raise if the live connection is not the STEWARD database. Returns the server version."""
    with engine.connect() as conn:
        current = conn.execute(text("SELECT current_database()")).scalar_one()
        if current != REQUIRED_DB_NAME:
            raise RuntimeError(f"Connected to '{current}', expected '{REQUIRED_DB_NAME}'. Aborting.")
        return conn.execute(text("SHOW server_version")).scalar_one()


def ping_postgres() -> bool:
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT current_database()")).scalar_one() == REQUIRED_DB_NAME
    except Exception:
        return False
