"""Central settings, loaded from environment variables (and the project-root .env in local dev)."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/common/steward_common/config.py -> project root is three levels up from `common`
_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"

# Safety guard: STEWARD must only ever talk to its own databases.
REQUIRED_DB_NAME = "steward_db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ROOT_ENV, extra="ignore")

    app_env: str = "development"

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = REQUIRED_DB_NAME
    postgres_user: str = "postgres"
    postgres_password: str = ""

    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = REQUIRED_DB_NAME

    redis_url: str = "redis://localhost:6379/0"
    redis_key_prefix: str = "steward"

    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    otp_ttl_seconds: int = 300
    internal_api_key: str = ""

    google_client_id: str = ""

    # Only read by scripts/create_admin.py
    admin_email: str = ""
    admin_password: str = ""

    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dim: int = 384

    user_service_url: str = "http://localhost:8001"
    restaurant_service_url: str = "http://localhost:8002"
    order_service_url: str = "http://localhost:8003"

    cors_origins: str = "http://localhost:5173"

    @field_validator("postgres_db", "mongodb_db")
    @classmethod
    def _must_be_steward_db(cls, value: str) -> str:
        if value != REQUIRED_DB_NAME:
            raise ValueError(
                f"Refusing to start: database name must be '{REQUIRED_DB_NAME}', got '{value}'"
            )
        return value

    @property
    def is_development(self) -> bool:
        return self.app_env.lower() == "development"

    @property
    def postgres_url(self):
        # Imported lazily so the gateway does not need SQLAlchemy installed.
        from sqlalchemy.engine import URL

        # URL.create escapes special characters in the password safely.
        return URL.create(
            "postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password or None,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def razorpay_enabled(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
