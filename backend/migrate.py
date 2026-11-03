"""
MoMoGuard Database Migration Runner
-----------------------------------
This utility applies incremental SQL migrations from the 'backend/migrations' directory
to an active PostgreSQL database.

It tracks applied migrations using the 'schema_migrations' metadata table:
1. Connects to PostgreSQL using DATABASE_URL.
2. Ensures the 'schema_migrations' tracking table exists.
3. Identifies unapplied SQL scripts in 'backend/migrations/*.sql' sorted alphabetically.
4. Executes migrations sequentially inside a transaction and records their version.
"""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Base directory for resolving migration scripts and environment variables
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise SystemExit("DATABASE_URL is required to execute database migrations.")

# Connect to target PostgreSQL database
with psycopg.connect(DATABASE_URL) as connection:
    # 1. Ensure migrations audit table exists
    connection.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
           version VARCHAR(120) PRIMARY KEY,
           applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )"""
    )

    # 2. Query already applied migration versions
    applied = {row[0] for row in connection.execute("SELECT version FROM schema_migrations")}

    # 3. Iterate over migration files in lexicographical order (e.g. 001_initial.sql, 002_devices.sql)
    for migration in sorted((BASE_DIR / "migrations").glob("*.sql")):
        if migration.name in applied:
            continue

        print(f"Applying migration: {migration.name}...")
        # Execute migration SQL script
        connection.execute(migration.read_text(encoding="utf-8"))
        # Record migration version in audit table
        connection.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (migration.name,))
        print(f"Successfully applied {migration.name}")

    print("Database migrations are fully up to date.")
