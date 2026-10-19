import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise SystemExit("DATABASE_URL is required")

with psycopg.connect(DATABASE_URL) as connection:
    connection.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
           version VARCHAR(120) PRIMARY KEY,
           applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )"""
    )
    applied = {row[0] for row in connection.execute("SELECT version FROM schema_migrations")}
    for migration in sorted((BASE_DIR / "migrations").glob("*.sql")):
        if migration.name in applied:
            continue
        connection.execute(migration.read_text(encoding="utf-8"))
        connection.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (migration.name,))
        print(f"Applied {migration.name}")
    print("Database migrations are up to date.")
