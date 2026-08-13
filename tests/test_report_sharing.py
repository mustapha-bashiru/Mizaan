"""Tests for opt-in public report sharing.

The point of these tests is that "shared" must mean *explicitly shared by the
owner*: an archived audit has to stay unreachable without a token, a token has
to be unguessable, and holding a token must not expose anything beyond the
report document itself.
"""

import json
import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Isolate storage before importing the app so settings pick up the temp dir.
_TMP_STORAGE = tempfile.mkdtemp(prefix="mizaan-share-")
os.environ["REPORT_STORAGE_DIR"] = _TMP_STORAGE
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-share-tests-0123456789")

import main  # noqa: E402
from auth import create_access_token, get_password_hash  # noqa: E402
from database import Base, get_db  # noqa: E402
from models import AuditHistory, UserDB  # noqa: E402

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture()
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    main.app.dependency_overrides[get_db] = lambda: db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()


def _make_user(db, email):
    user = UserDB(
        email=email,
        hashed_password=get_password_hash("Passw0rd!123"),
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _make_audit(db, user, name="Acme Protocol", score=35):
    # The rendered report is rebuilt from report_json, so the score has to live
    # in the document; the column is only history metadata for search/sort.
    report = {
        "project_name": name,
        "token_ticker": "ACME",
        "executive_summary": "Summary",
        "overall_shariah_risk_score": score,
    }
    row = AuditHistory(
        user_id=user.id,
        user_email=user.email,
        project_or_platform_name=name,
        mode="crypto",
        summary_text="Summary",
        report_json=json.dumps(report),
        report_id="MZN-TEST-0002",
        risk_score=score,
        classification="Conditionally Permissible",
        report_type="Crypto Protocol Audit",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Creating a share link
# ---------------------------------------------------------------------------
def test_share_requires_authentication(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    assert client.post(f"/api/history/{audit.id}/share").status_code == 401


def test_cannot_share_another_users_audit(client, db):
    alice = _make_user(db, "alice@example.com")
    bob = _make_user(db, "bob@example.com")
    bob_audit = _make_audit(db, bob)

    response = client.post(f"/api/history/{bob_audit.id}/share", headers=_auth(alice))

    assert response.status_code == 404
    db.refresh(bob_audit)
    assert bob_audit.share_token is None


def test_share_returns_a_high_entropy_token_and_url(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    body = client.post(f"/api/history/{audit.id}/share", headers=_auth(alice)).json()

    # Long enough that share links cannot be enumerated, and never the short,
    # date-derived report_id.
    assert len(body["share_token"]) >= 40
    assert audit.report_id not in body["share_token"]
    assert body["share_url"].endswith(f"/reports/{body['share_token']}")


def test_sharing_twice_keeps_the_same_link(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    first = client.post(f"/api/history/{audit.id}/share", headers=_auth(alice)).json()
    second = client.post(f"/api/history/{audit.id}/share", headers=_auth(alice)).json()

    # A link already sent to somebody must not stop working.
    assert first["share_token"] == second["share_token"]


# ---------------------------------------------------------------------------
# Reading a shared report
# ---------------------------------------------------------------------------
def test_unshared_audit_is_not_publicly_readable(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    # The private identifiers must not work as public keys.
    assert client.get(f"/api/reports/{audit.id}").status_code == 404
    assert client.get(f"/api/reports/{audit.report_id}").status_code == 404


def test_unknown_token_is_not_found(client, db):
    _make_user(db, "alice@example.com")

    assert client.get("/api/reports/definitely-not-a-real-token").status_code == 404


def test_shared_report_is_readable_without_authentication(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    token = client.post(
        f"/api/history/{audit.id}/share", headers=_auth(alice)
    ).json()["share_token"]

    response = client.get(f"/api/reports/{token}")

    assert response.status_code == 200
    report = response.json()["report"]
    assert report["project_name"] == "Acme Protocol"
    assert report["overall_shariah_risk_score"] == 35


def test_shared_report_exposes_only_the_report_document(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    token = client.post(
        f"/api/history/{audit.id}/share", headers=_auth(alice)
    ).json()["share_token"]

    body = client.get(f"/api/reports/{token}").json()
    serialised = json.dumps(body)

    # No owner email, no numeric row id, no history metadata.
    assert set(body) == {"report"}
    assert "alice@example.com" not in serialised
    assert "share_token" not in serialised


def test_deleting_an_audit_kills_its_share_link(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    token = client.post(
        f"/api/history/{audit.id}/share", headers=_auth(alice)
    ).json()["share_token"]
    assert client.get(f"/api/reports/{token}").status_code == 200

    client.delete(f"/api/history/{audit.id}", headers=_auth(alice))

    assert client.get(f"/api/reports/{token}").status_code == 404
