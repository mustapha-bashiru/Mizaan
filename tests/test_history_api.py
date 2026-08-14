"""End-to-end tests for the audit history API.

These focus on the security-critical behaviour: a user must never be able to
read, download or delete another user's audit, and a tampered ``pdf_filename``
must not be able to escape the report storage directory.
"""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Isolate storage before importing the app so settings pick up the temp dir.
_TMP_STORAGE = tempfile.mkdtemp(prefix="mizaan-reports-")
os.environ["REPORT_STORAGE_DIR"] = _TMP_STORAGE
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-history-tests-0123456789")

import history  # noqa: E402
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
    row = AuditHistory(
        user_id=user.id,
        user_email=user.email,
        project_or_platform_name=name,
        mode="crypto",
        summary_text="Summary",
        report_json='{"executive_summary": "Summary"}',
        report_id="MZN-TEST-0001",
        risk_score=score,
        classification="Conditionally Permissible",
        report_type="Crypto Protocol Audit",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
def test_history_requires_authentication(client):
    assert client.get("/api/history").status_code == 401


# ---------------------------------------------------------------------------
# Ownership isolation
# ---------------------------------------------------------------------------
def test_history_only_returns_own_audits(client, db):
    alice = _make_user(db, "alice@example.com")
    bob = _make_user(db, "bob@example.com")
    _make_audit(db, alice, name="Alice Protocol")
    _make_audit(db, bob, name="Bob Protocol")

    body = client.get("/api/history", headers=_auth(alice)).json()

    assert body["total"] == 1
    assert body["items"][0]["project_name"] == "Alice Protocol"


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/history/{id}"),
        ("get", "/api/history/{id}/pdf"),
        ("get", "/api/history/{id}/rerun-context"),
        ("delete", "/api/history/{id}"),
    ],
)
def test_cannot_touch_another_users_audit(client, db, method, path):
    alice = _make_user(db, "alice@example.com")
    bob = _make_user(db, "bob@example.com")
    bob_audit = _make_audit(db, bob)

    response = getattr(client, method)(
        path.format(id=bob_audit.id), headers=_auth(alice)
    )

    # Identical to a genuinely missing row: existence is never disclosed.
    assert response.status_code == 404
    assert db.query(AuditHistory).filter_by(id=bob_audit.id).first() is not None


def test_delete_removes_own_audit(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    assert client.delete(f"/api/history/{audit.id}", headers=_auth(alice)).status_code == 204
    assert db.query(AuditHistory).filter_by(id=audit.id).first() is None


# ---------------------------------------------------------------------------
# Search, filter, sort, pagination
# ---------------------------------------------------------------------------
def test_search_filters_by_project_name(client, db):
    alice = _make_user(db, "alice@example.com")
    _make_audit(db, alice, name="Uniswap")
    _make_audit(db, alice, name="Aave")

    body = client.get("/api/history?search=uni", headers=_auth(alice)).json()

    assert [i["project_name"] for i in body["items"]] == ["Uniswap"]


def test_score_range_filter(client, db):
    alice = _make_user(db, "alice@example.com")
    _make_audit(db, alice, name="Low", score=10)
    _make_audit(db, alice, name="High", score=90)

    body = client.get("/api/history?min_score=50", headers=_auth(alice)).json()

    assert [i["project_name"] for i in body["items"]] == ["High"]


def test_sort_by_score_descending(client, db):
    alice = _make_user(db, "alice@example.com")
    _make_audit(db, alice, name="Low", score=10)
    _make_audit(db, alice, name="High", score=90)

    body = client.get("/api/history?sort=score_desc", headers=_auth(alice)).json()

    assert [i["project_name"] for i in body["items"]] == ["High", "Low"]


def test_pagination_reports_has_more(client, db):
    alice = _make_user(db, "alice@example.com")
    for index in range(3):
        _make_audit(db, alice, name=f"Project {index}")

    body = client.get("/api/history?page=1&page_size=2", headers=_auth(alice)).json()

    assert len(body["items"]) == 2
    assert body["total"] == 3
    assert body["has_more"] is True


def test_invalid_date_is_rejected(client, db):
    alice = _make_user(db, "alice@example.com")

    response = client.get("/api/history?date_from=not-a-date", headers=_auth(alice))

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# PDF delivery
# ---------------------------------------------------------------------------
def test_pdf_is_rendered_on_demand_when_missing(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)  # no pdf_filename stored

    response = client.get(f"/api/history/{audit.id}/pdf", headers=_auth(alice))

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert response.headers["cache-control"] == "private, no-store"


def test_malformed_cached_arabic_pdf_is_rerendered(client, db, monkeypatch):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)
    audit.report_json = '{"language": "ar", "executive_summary": "ملخص"}'
    audit.pdf_filename = "legacy-arabic.pdf"
    legacy_path = history.storage_dir() / audit.pdf_filename
    legacy_path.write_bytes(b"%PDF-legacy-Helvetica-only")
    db.commit()

    rendered = b"%PDF-repaired-IBMPlexSansArabic-MizaanArabicPDF-v2"
    calls = []

    def fake_build(*args, **kwargs):
        calls.append(kwargs)
        return rendered

    monkeypatch.setattr(history, "build_audit_pdf", fake_build)

    response = client.get(f"/api/history/{audit.id}/pdf", headers=_auth(alice))

    assert response.status_code == 200
    assert response.content == rendered
    assert calls[0]["language"] == "ar"
    assert legacy_path.read_bytes() == rendered


def test_pre_purity_arabic_pdf_is_rerendered(client, db, monkeypatch):
    alice = _make_user(db, "alice-cache@example.com")
    audit = _make_audit(db, alice)
    audit.report_json = '{"language": "ar", "executive_summary": "ملخص"}'
    audit.pdf_filename = "old-arabic-with-font.pdf"
    cached_path = history.storage_dir() / audit.pdf_filename
    cached_path.write_bytes(b"%PDF-IBMPlexSansArabic-with-English-jargon")
    db.commit()

    rendered = b"%PDF-IBMPlexSansArabic-MizaanArabicPDF-v2"
    monkeypatch.setattr(history, "build_audit_pdf", lambda *args, **kwargs: rendered)

    response = client.get(f"/api/history/{audit.id}/pdf", headers=_auth(alice))

    assert response.status_code == 200
    assert response.content == rendered
    assert cached_path.read_bytes() == rendered


def test_legacy_arabic_pdf_without_language_marker_is_rerendered(
    client, db, monkeypatch
):
    alice = _make_user(db, "legacy-arabic@example.com")
    audit = _make_audit(db, alice)
    audit.report_json = '{"executive_summary": "ملخص عربي"}'
    audit.pdf_filename = "legacy-arabic-without-language.pdf"
    cached_path = history.storage_dir() / audit.pdf_filename
    cached_path.write_bytes(b"%PDF-legacy-Helvetica-only")
    db.commit()

    rendered = b"%PDF-IBMPlexSansArabic-MizaanArabicPDF-v2"
    calls = []

    def fake_build(*args, **kwargs):
        calls.append(kwargs)
        return rendered

    monkeypatch.setattr(history, "build_audit_pdf", fake_build)

    response = client.get(f"/api/history/{audit.id}/pdf", headers=_auth(alice))

    assert response.status_code == 200
    assert response.content == rendered
    assert calls[0]["language"] == "ar"
    assert cached_path.read_bytes() == rendered


def test_traversal_filename_is_not_read_from_disk(client, db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)

    # Simulate a tampered row pointing outside the storage directory.
    audit.pdf_filename = "../../../../Windows/win.ini"
    db.commit()

    response = client.get(f"/api/history/{audit.id}/pdf", headers=_auth(alice))

    # The path is rejected, so the endpoint falls back to a fresh render.
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


def test_resolve_rejects_paths_outside_storage(db):
    alice = _make_user(db, "alice@example.com")
    audit = _make_audit(db, alice)
    audit.pdf_filename = "../escape.pdf"

    assert history._resolve_pdf_path(audit) is None
