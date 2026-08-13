"""Upgrade path for the unique-email index on an already-deployed database.

The production database predates the index, so ``run_migrations`` has to do
three things in order: canonicalise stored emails, refuse to continue if real
duplicate accounts exist, then create the index. These tests exercise that
sequence against a legacy-shaped SQLite file rather than a fresh schema.
"""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from migrations import (
    _EMAIL_INDEX_NAME,
    DuplicateEmailsFound,
    run_migrations,
)

# The original users table: no verification columns, no functional index.
LEGACY_USERS_DDL = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email VARCHAR NOT NULL,
    hashed_password VARCHAR NOT NULL
)
"""


@pytest.fixture
def legacy_engine(tmp_path):
    """A file-backed database shaped like the pre-index deployment."""
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.execute(text(LEGACY_USERS_DDL))
    return engine


def seed(engine, *emails):
    with engine.begin() as connection:
        for index, email in enumerate(emails):
            connection.execute(
                text("INSERT INTO users (email, hashed_password) VALUES (:e, :p)"),
                {"e": email, "p": f"hash-{index}"},
            )


def stored_emails(engine):
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT email FROM users ORDER BY id")).fetchall()
    return [row[0] for row in rows]


def index_names(engine):
    """Index names read straight from the SQLite catalog.

    SQLAlchemy's inspector skips expression-based indexes, so it would report
    the functional lower(email) index as absent even when it exists.
    """
    with engine.connect() as connection:
        rows = connection.execute(
            text("SELECT name FROM sqlite_master WHERE type = 'index'")
        ).fetchall()
    return {row[0] for row in rows}


def test_index_is_created_on_a_legacy_database(legacy_engine):
    seed(legacy_engine, "existing@example.com")

    applied = run_migrations(legacy_engine)

    assert _EMAIL_INDEX_NAME in index_names(legacy_engine)
    assert any(_EMAIL_INDEX_NAME in change for change in applied)


def test_existing_emails_are_canonicalised(legacy_engine):
    """Legacy rows are trimmed and lowercased so lookups keep matching."""
    seed(legacy_engine, "  Mixed@Example.COM  ", "already@example.com")

    applied = run_migrations(legacy_engine)

    assert stored_emails(legacy_engine) == [
        "mixed@example.com",
        "already@example.com",
    ]
    assert any("normalised" in change for change in applied)


def test_duplicate_accounts_block_the_migration(legacy_engine):
    """Startup must fail loudly instead of deleting one of two real accounts."""
    seed(legacy_engine, "dupe@example.com", "DUPE@example.com")

    with pytest.raises(DuplicateEmailsFound) as excinfo:
        run_migrations(legacy_engine)

    assert "dupe@example.com" in str(excinfo.value)
    # The rows are left untouched for the operator to merge.
    assert len(stored_emails(legacy_engine)) == 2
    assert _EMAIL_INDEX_NAME not in index_names(legacy_engine)


def test_migration_is_idempotent(legacy_engine):
    seed(legacy_engine, "stable@example.com")

    run_migrations(legacy_engine)
    second_pass = run_migrations(legacy_engine)

    assert _EMAIL_INDEX_NAME in index_names(legacy_engine)
    assert not any(_EMAIL_INDEX_NAME in change for change in second_pass)


def test_index_rejects_case_variant_inserts_after_migration(legacy_engine):
    """Proof the upgraded database enforces the rule, not just the app layer."""
    seed(legacy_engine, "guard@example.com")
    run_migrations(legacy_engine)

    with pytest.raises(IntegrityError):
        seed(legacy_engine, "GUARD@EXAMPLE.COM")
