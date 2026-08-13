"""Minimal, explicit schema reconciliation for the SQLite deployment.

This is deliberately small and additive: it creates missing tables and adds
missing columns that were introduced after the first release. Unlike the
previous blanket ``try/except: pass`` ALTER statements, failures are logged
with the exact column that failed instead of being silently swallowed.

For anything beyond additive columns (renames, drops, type changes) use a
real migration tool such as Alembic.
"""

import logging
from typing import Dict, List, Tuple

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from database import Base, engine
import models  # noqa: F401  (ensures models are registered on Base.metadata)

logger = logging.getLogger(__name__)

# table -> list of (column_name, DDL type + default)
_ADDITIVE_COLUMNS: Dict[str, List[Tuple[str, str]]] = {
    "users": [
        ("is_verified", "BOOLEAN NOT NULL DEFAULT 0"),
        ("otp_hash", "VARCHAR"),
        ("otp_expires_at", "DATETIME"),
        ("otp_attempts", "INTEGER NOT NULL DEFAULT 0"),
        ("otp_last_sent_at", "DATETIME"),
        ("analysis_count", "INTEGER NOT NULL DEFAULT 0"),
        ("daily_audit_count", "INTEGER NOT NULL DEFAULT 0"),
        ("last_audit_date", "VARCHAR"),
        ("donation_prompt_enabled", "BOOLEAN NOT NULL DEFAULT 1"),
        ("created_at", "DATETIME"),
        ("reset_token_hash", "VARCHAR"),
        ("reset_expires_at", "DATETIME"),
    ],
    "audit_history": [
        ("user_id", "INTEGER"),
        ("user_email", "VARCHAR"),
        ("summary_text", "TEXT"),
        ("report_json", "TEXT"),
        ("created_at", "DATETIME"),
        # Audit history metadata, denormalised for search/filter/sort.
        ("report_id", "VARCHAR"),
        ("risk_score", "INTEGER"),
        ("classification", "VARCHAR"),
        ("report_type", "VARCHAR"),
        ("pdf_filename", "VARCHAR"),
        # Opt-in public share link. NULL means "not shared", so existing rows
        # stay private after the upgrade.
        ("share_token", "VARCHAR"),
    ],
}

# Columns from the removed subscription/payment feature. They are left in place
# (SQLite cannot drop columns portably) but are no longer read or written.
_DEPRECATED_COLUMNS: Dict[str, List[str]] = {
    "users": ["is_premium", "otp_code"],
}

# Unique, case-insensitive email index. Declared in models.py for fresh
# databases; recreated here for databases that predate it.
_EMAIL_INDEX_NAME = "ix_users_email_lower_unique"

# Uniqueness of share tokens is what makes a share link identify exactly one
# audit. ALTER TABLE ADD COLUMN cannot carry a UNIQUE constraint in SQLite, so
# databases that predate the column get the index created separately here.
_SHARE_TOKEN_INDEX_NAME = "ix_audit_history_share_token"


class DuplicateEmailsFound(RuntimeError):
    """Raised when live data blocks the unique email index.

    Deliberately fatal: silently merging or deleting accounts that differ only
    by capitalisation would destroy real users' audit history. An operator has
    to decide which row survives.
    """


def _normalise_existing_emails(target_engine: Engine, applied: List[str]) -> None:
    """Trims and lowercases stored emails so lookups match new registrations."""
    with target_engine.begin() as connection:
        result = connection.execute(
            text(
                "UPDATE users SET email = lower(trim(email)) "
                "WHERE email <> lower(trim(email))"
            )
        )
    if result.rowcount:
        applied.append(f"users.email normalised for {result.rowcount} row(s)")


def _assert_no_duplicate_emails(target_engine: Engine) -> None:
    """Fails loudly if two accounts differ only by email capitalisation."""
    with target_engine.connect() as connection:
        clashes = connection.execute(
            text(
                "SELECT lower(trim(email)) AS canonical, COUNT(*) AS hits "
                "FROM users GROUP BY canonical HAVING hits > 1"
            )
        ).fetchall()

    if clashes:
        addresses = ", ".join(row[0] for row in clashes)
        raise DuplicateEmailsFound(
            "Cannot enforce unique emails: duplicate accounts exist for "
            f"{addresses}. Merge or remove the extra rows (keep the verified "
            "account and its audit history), then restart the service."
        )


def _email_index_exists(target_engine: Engine) -> bool:
    """Reports whether the functional unique index is already in place.

    SQLite's reflection silently skips expression-based indexes ("Skipped
    unsupported reflection of expression-based index"), so the inspector would
    report this index as missing on every boot and the migration would rescan
    the whole users table forever. The catalog is queried directly instead.
    """
    if target_engine.dialect.name == "sqlite":
        with target_engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT 1 FROM sqlite_master "
                    "WHERE type = 'index' AND name = :name"
                ),
                {"name": _EMAIL_INDEX_NAME},
            ).first()
        return row is not None

    inspector = inspect(target_engine)
    return _EMAIL_INDEX_NAME in {idx["name"] for idx in inspector.get_indexes("users")}


def _ensure_unique_email_index(target_engine: Engine, applied: List[str]) -> None:
    """Creates the case-insensitive unique index on users.email.

    Normalise first, then verify, then index: the index is only created once
    the data is known to satisfy it, so startup fails with an actionable
    message instead of a raw driver error.
    """
    if _email_index_exists(target_engine):
        return

    _normalise_existing_emails(target_engine, applied)
    _assert_no_duplicate_emails(target_engine)

    with target_engine.begin() as connection:
        connection.execute(
            text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {_EMAIL_INDEX_NAME} "
                "ON users (lower(email))"
            )
        )
    applied.append(f"{_EMAIL_INDEX_NAME} created on users(lower(email))")


def _ensure_share_token_index(target_engine: Engine, applied: List[str]) -> None:
    """Creates the unique index backing public report share links."""
    inspector = inspect(target_engine)
    if _SHARE_TOKEN_INDEX_NAME in {
        idx["name"] for idx in inspector.get_indexes("audit_history")
    }:
        return

    with target_engine.begin() as connection:
        connection.execute(
            text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {_SHARE_TOKEN_INDEX_NAME} "
                "ON audit_history (share_token)"
            )
        )
    applied.append(f"{_SHARE_TOKEN_INDEX_NAME} created on audit_history(share_token)")


def run_migrations(target_engine: Engine = engine) -> List[str]:
    """Creates missing tables/columns. Returns a log of applied changes."""
    applied: List[str] = []

    Base.metadata.create_all(bind=target_engine)

    inspector = inspect(target_engine)
    existing_tables = set(inspector.get_table_names())

    for table, columns in _ADDITIVE_COLUMNS.items():
        if table not in existing_tables:
            continue

        existing_columns = {col["name"] for col in inspector.get_columns(table)}

        for column_name, ddl_type in columns:
            if column_name in existing_columns:
                continue

            statement = text(
                f"ALTER TABLE {table} ADD COLUMN {column_name} {ddl_type}"
            )
            try:
                with target_engine.begin() as connection:
                    connection.execute(statement)
                applied.append(f"{table}.{column_name} added")
            except Exception as exc:  # pragma: no cover - environment specific
                logger.error(
                    "Migration failed for %s.%s: %s", table, column_name, exc
                )

    # Backfill audit_history.user_id from the legacy email column.
    if "audit_history" in existing_tables and "users" in existing_tables:
        try:
            with target_engine.begin() as connection:
                result = connection.execute(
                    text(
                        "UPDATE audit_history SET user_id = ("
                        "  SELECT users.id FROM users"
                        "  WHERE users.email = audit_history.user_email"
                        ") WHERE user_id IS NULL AND user_email IS NOT NULL"
                    )
                )
            if result.rowcount:
                applied.append(
                    f"audit_history.user_id backfilled for {result.rowcount} row(s)"
                )
        except Exception as exc:  # pragma: no cover - environment specific
            logger.error("Backfill of audit_history.user_id failed: %s", exc)

    # Duplicate-account prevention at the storage layer. Runs after the
    # additive columns so is_verified is available for operator triage.
    if "users" in existing_tables:
        _ensure_unique_email_index(target_engine, applied)

    if "audit_history" in existing_tables:
        _ensure_share_token_index(target_engine, applied)

    for table, columns in _DEPRECATED_COLUMNS.items():
        if table not in existing_tables:
            continue
        existing_columns = {col["name"] for col in inspector.get_columns(table)}
        for column_name in columns:
            if column_name in existing_columns:
                logger.info(
                    "Column %s.%s belongs to the removed subscription feature "
                    "and is no longer used.",
                    table,
                    column_name,
                )

    return applied


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    changes = run_migrations()
    if changes:
        for change in changes:
            print(f"applied: {change}")
    else:
        print("schema already up to date")
