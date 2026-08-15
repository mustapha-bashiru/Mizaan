"""Duplicate-account prevention for POST /api/register.

Covers the three required cases (new email succeeds, existing email is
rejected with 409, a different email still succeeds) plus the details that
make the rule hold in production: case-insensitive matching, the database
level unique index, the concurrent-signup race, and the guarantee that a
rejected signup never mutates the existing account.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Query, sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
import main as main_module
from main import app
from models import UserDB

# StaticPool keeps every connection pointed at the same in-memory database;
# without it each connection would get its own empty schema.
test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

PASSWORD = "StrongPass123"


def _override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def db_session():
    """Fresh schema per test, with the override scoped to this module.

    The override is restored afterwards so this file cannot leak state into
    the other API test modules, which install their own database.
    """
    Base.metadata.create_all(bind=test_engine)
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = _override_get_db

    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
        if previous is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    # Instantiated without a context manager so the app's lifespan (which runs
    # migrations against the real database) never fires during tests.
    return TestClient(app)


def register(client, email, password=PASSWORD):
    return client.post("/api/register", json={"email": email, "password": password})


def verify(db_session, email):
    """Marks an account as email-verified, as a successful OTP would."""
    user = db_session.query(UserDB).filter(UserDB.email == email).first()
    user.is_verified = True
    db_session.commit()


# ---------------------------------------------------------------------------
# Required cases
# ---------------------------------------------------------------------------
def test_new_email_registers_successfully(client):
    response = register(client, "alice@example.com")

    assert response.status_code == 201
    assert response.json()["email"] == "alice@example.com"


def test_existing_email_is_rejected_with_409(client, db_session):
    register(client, "bob@example.com")
    verify(db_session, "bob@example.com")

    response = register(client, "bob@example.com")

    assert response.status_code == 409
    assert db_session.query(UserDB).filter(UserDB.email == "bob@example.com").count() == 1


def test_different_email_still_registers_successfully(client):
    assert register(client, "carol@example.com").status_code == 201
    assert register(client, "dave@example.com").status_code == 201


# ---------------------------------------------------------------------------
# Verified vs. unverified guidance
# ---------------------------------------------------------------------------
def test_verified_duplicate_is_told_to_log_in(client, db_session):
    register(client, "erin@example.com")
    verify(db_session, "erin@example.com")

    detail = register(client, "erin@example.com").json()["detail"]

    assert detail["code"] == "email_exists_verified"
    assert detail["message"] == (
        "An account with this email already exists. "
        "Please log in or use the Forgot Password option."
    )


def test_unverified_duplicate_is_told_to_verify(client):
    register(client, "frank@example.com")

    response = register(client, "frank@example.com")
    detail = response.json()["detail"]

    assert response.status_code == 409
    assert detail["code"] == "email_exists_unverified"
    assert detail["message"] == (
        "This email has already been registered but not verified. "
        "Please verify your email or request a new OTP."
    )


# ---------------------------------------------------------------------------
# Case-insensitivity
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "variant",
    ["User@example.com", "USER@EXAMPLE.COM", "uSeR@ExAmPlE.cOm"],
)
def test_email_matching_ignores_case(client, db_session, variant):
    assert register(client, "user@example.com").status_code == 201

    assert register(client, variant).status_code == 409
    assert db_session.query(UserDB).count() == 1


def test_email_is_stored_lowercased(client, db_session):
    response = register(client, "Grace@Example.COM")

    assert response.status_code == 201
    assert response.json()["email"] == "grace@example.com"
    assert db_session.query(UserDB).one().email == "grace@example.com"


# ---------------------------------------------------------------------------
# Database-level guarantee
# ---------------------------------------------------------------------------
def test_database_rejects_duplicate_email(db_session):
    db_session.add(UserDB(email="heidi@example.com", hashed_password="x"))
    db_session.commit()

    db_session.add(UserDB(email="heidi@example.com", hashed_password="y"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_database_rejects_case_variant_email(db_session):
    """The unique index is functional (lower(email)), not just literal."""
    db_session.add(UserDB(email="ivan@example.com", hashed_password="x"))
    db_session.commit()

    # Bypasses normalize_email entirely, which is exactly what the index is for.
    db_session.add(UserDB(email="IVAN@EXAMPLE.COM", hashed_password="y"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_concurrent_signup_loses_race_with_409(client, db_session, monkeypatch):
    """The insert, not just the pre-check, is what stops a duplicate.

    The first ``Query.first()`` is forced to report "no such user", which is
    what a request would see if a competing signup had not committed yet. The
    INSERT then hits the unique index, and that must surface as 409 rather
    than a 500.
    """
    register(client, "judy@example.com")
    original_first = Query.first
    calls = {"count": 0}

    def blind_first(self):
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return original_first(self)

    monkeypatch.setattr(Query, "first", blind_first)

    response = register(client, "judy@example.com")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "email_exists_unverified"
    assert db_session.query(UserDB).count() == 1


# ---------------------------------------------------------------------------
# The rejected signup must not touch the existing account
# ---------------------------------------------------------------------------
def test_duplicate_signup_does_not_change_stored_password(client, db_session):
    register(client, "mallory@example.com", "OriginalPass123")
    original_hash = db_session.query(UserDB).one().hashed_password

    register(client, "mallory@example.com", "AttackerPass456")

    db_session.expire_all()
    assert db_session.query(UserDB).one().hashed_password == original_hash


def test_duplicate_signup_does_not_reset_verified_flag(client, db_session):
    register(client, "niaj@example.com")
    verify(db_session, "niaj@example.com")

    register(client, "niaj@example.com")

    db_session.expire_all()
    assert db_session.query(UserDB).one().is_verified is True


def test_duplicate_signup_does_not_issue_a_new_otp(client, db_session):
    """Re-registering must not become a free, unthrottled OTP resend."""
    register(client, "olivia@example.com")
    original_otp_hash = db_session.query(UserDB).one().otp_hash

    register(client, "olivia@example.com")

    db_session.expire_all()
    assert db_session.query(UserDB).one().otp_hash == original_otp_hash


# ---------------------------------------------------------------------------
# OTP delivery and resend cooldown
# ---------------------------------------------------------------------------
def test_successful_delivery_starts_30_second_cooldown(client, db_session, monkeypatch):
    monkeypatch.setattr(main_module, "send_otp_email", lambda *_: True)

    response = register(client, "pat@example.com")

    assert response.status_code == 201
    assert response.json()["email_delivered"] is True
    assert response.json()["retry_after_seconds"] == 30
    db_session.expire_all()
    assert db_session.query(UserDB).one().otp_last_sent_at is not None

    resend = client.post("/api/resend-otp", json={"email": "pat@example.com"})
    assert resend.status_code == 429
    assert resend.json()["detail"]["retry_after_seconds"] == 30


def test_failed_delivery_does_not_start_cooldown(client, db_session, monkeypatch):
    monkeypatch.setattr(main_module, "send_otp_email", lambda *_: False)

    response = register(client, "quinn@example.com")

    assert response.status_code == 201
    assert response.json()["email_delivered"] is False
    assert response.json()["retry_after_seconds"] == 0
    db_session.expire_all()
    assert db_session.query(UserDB).one().otp_last_sent_at is None

    resend = client.post("/api/resend-otp", json={"email": "quinn@example.com"})
    assert resend.status_code == 200
    assert resend.json()["email_delivered"] is False
    assert resend.json()["retry_after_seconds"] == 0
