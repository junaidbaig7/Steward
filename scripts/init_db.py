"""Apply database/postgres/schema.sql to steward_db (idempotent, no DROP statements).

Usage:  backend/.venv/bin/python scripts/init_db.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "common"))

from sqlalchemy import text  # noqa: E402

from steward_common.postgres import engine, verify_steward_database  # noqa: E402

SCHEMA = ROOT / "database" / "postgres" / "schema.sql"
FORBIDDEN = re.compile(r"\b(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE)\b", re.IGNORECASE)


def main() -> None:
    version = verify_steward_database()  # raises unless current_database() = 'steward_db'
    sql = SCHEMA.read_text()
    if FORBIDDEN.search(sql):
        sys.exit("schema.sql contains a destructive statement — refusing to apply.")

    print(f"✓ Connected to steward_db (PostgreSQL {version})")
    # One transaction: either the whole schema applies or nothing does.
    with engine.begin() as conn:
        conn.exec_driver_sql(sql)
        tables = conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
        )).scalars().all()
        vector = conn.execute(text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")).scalar()

    print(f"✓ pgvector {vector} enabled")
    print(f"✓ Tables ({len(tables)}): {', '.join(tables)}")


if __name__ == "__main__":
    main()
