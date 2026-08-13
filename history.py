"""Audit history: persistence, search/filter API and secure PDF delivery.

Security model
--------------
Every endpoint filters by ``AuditHistory.user_id == current_user.id`` *inside*
the query rather than fetching by id and comparing afterwards. A missing row
and a row belonging to somebody else therefore produce an identical 404, so the
API never confirms that another user's audit exists.

PDFs are written to ``settings.report_storage_dir``, which sits outside any
statically served directory. The database stores only a bare filename; the
absolute path is rebuilt at download time and verified to resolve inside the
storage directory, so a tampered row cannot turn into a path traversal.

Public sharing is opt-in and link-based: an audit is unreachable without
authentication until its owner calls ``POST /api/history/{id}/share``, which
mints a high-entropy ``share_token``. ``report_id`` is deliberately *not* used
as the public key — it is short and partly derived from the date, so it would be
guessable. Only the report document is exposed through the public route; the
owner's email, the numeric row id and the stored PDF stay private.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth import get_current_user
from config import settings
from database import get_db
from models import AuditHistory, UserDB
from report_i18n import normalize_language
from report_pdf import build_audit_pdf
from report_schema import clamp_score, generate_report_id, normalize_report, risk_band

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/history", tags=["history"])

# Unauthenticated, token-addressed reports. Kept on its own router (and its own
# prefix) so no dependency or path from the private history API can leak into
# it by accident.
public_router = APIRouter(prefix="/api/reports", tags=["public reports"])

# 32 bytes -> 256 bits of entropy, URL-safe. Long enough that share links
# cannot be enumerated.
_SHARE_TOKEN_BYTES = 32

# Only ever used to build a download filename, never to locate a file.
_UNSAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")

MODE_LABELS = {
    "crypto": "Crypto Protocol Audit",
    "business": "Business Model Audit",
    "platform": "Platform Audit",
}


def storage_dir() -> Path:
    """Returns the report directory, creating it on first use."""
    path = Path(settings.report_storage_dir).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_slug(value: str, fallback: str = "report") -> str:
    slug = _UNSAFE_FILENAME_CHARS.sub("-", (value or "").strip()).strip("-")
    return (slug or fallback)[:60]


def audit_type_for(mode: str) -> str:
    return MODE_LABELS.get((mode or "").lower(), "Shariah Compliance Audit")


def _new_share_token() -> str:
    return secrets.token_urlsafe(_SHARE_TOKEN_BYTES)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def save_audit(
    db: Session,
    user: UserDB,
    *,
    project_name: str,
    mode: str,
    report: Dict[str, Any],
    language: str = "en",
) -> Optional[AuditHistory]:
    """Persists a completed audit and renders its PDF.

    Returns the stored row, or ``None`` if persistence failed. Callers must
    treat this as best-effort: an audit that has already been generated and
    charged should still be returned to the user even if archiving it fails.
    """
    report_id = generate_report_id()
    audit_type = audit_type_for(mode)
    created_at = datetime.now(timezone.utc)
    report_language = normalize_language(language)

    # Stamp the identity onto the payload so the stored JSON, the PDF and the
    # history row all describe the same report.
    enriched = dict(report or {})
    enriched["report_id"] = report_id
    enriched["audit_type"] = audit_type
    enriched["generated_at"] = created_at.isoformat()
    # Persisted with the report so a later re-render reproduces the document in
    # the language the user actually requested, not the server default.
    enriched["language"] = report_language

    normalized = normalize_report(
        enriched,
        report_id=report_id,
        audit_type=audit_type,
        generated_at=created_at,
        language=report_language,
    )

    row = AuditHistory(
        user_id=user.id,
        user_email=user.email,
        project_or_platform_name=project_name[:255],
        mode=mode,
        summary_text=(normalized.get("executive_summary") or "")[:2000],
        report_json=json.dumps(enriched),
        report_id=report_id,
        risk_score=normalized["overall_shariah_risk_score"],
        classification=normalized["classification"],
        report_type=audit_type,
        created_at=created_at.replace(tzinfo=None),
    )

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        logger.exception("Failed to persist audit history")
        db.rollback()
        return None

    # The PDF is generated eagerly so "Download" is instant, but a rendering
    # failure must not lose the audit itself: the row stays, and the download
    # endpoint re-renders on demand when pdf_filename is empty.
    try:
        pdf_bytes = build_audit_pdf(
            enriched,
            report_id=report_id,
            audit_type=audit_type,
            generated_at=created_at,
            language=report_language,
        )
        filename = f"{report_id}-{_safe_slug(project_name)}.pdf"
        (storage_dir() / filename).write_bytes(pdf_bytes)
        row.pdf_filename = filename
        db.commit()
    except Exception:
        logger.exception("Failed to render PDF for report %s", report_id)
        db.rollback()

    _enforce_retention(db, user)
    return row


def _enforce_retention(db: Session, user: UserDB) -> None:
    """Trims a user's history to the configured limit, oldest first."""
    limit = settings.report_retention_limit
    if limit <= 0:
        return

    try:
        stale = (
            db.query(AuditHistory)
            .filter(AuditHistory.user_id == user.id)
            .order_by(AuditHistory.created_at.desc())
            .offset(limit)
            .all()
        )
        for row in stale:
            _delete_pdf(row)
            db.delete(row)
        if stale:
            db.commit()
    except Exception:
        logger.exception("History retention cleanup failed")
        db.rollback()


def _delete_pdf(row: AuditHistory) -> None:
    path = _resolve_pdf_path(row)
    if path and path.exists():
        try:
            path.unlink()
        except OSError:
            logger.warning("Could not remove report file %s", path)


def delete_stored_pdfs_for_user(db: Session, user: UserDB) -> int:
    """Removes every report PDF belonging to ``user`` from disk.

    Deleting the user row cascades to their ``audit_history`` rows, but the
    rendered PDFs live on the filesystem and would otherwise be orphaned there
    indefinitely. Called before the cascade so the filenames are still readable.

    Returns the number of files removed. A file that cannot be deleted is logged
    and skipped rather than raised: a stale file on disk must not be allowed to
    block the user's deletion request.
    """
    rows = (
        db.query(AuditHistory)
        .filter(AuditHistory.user_id == user.id)
        .all()
    )

    removed = 0
    for row in rows:
        path = _resolve_pdf_path(row)
        if not path:
            continue
        try:
            path.unlink(missing_ok=True)
            removed += 1
        except OSError as exc:
            logger.error("Could not delete report file %s: %s", path, exc)

    return removed


def _resolve_pdf_path(row: AuditHistory) -> Optional[Path]:

    """Resolves a stored filename inside the storage directory, or None.

    Rejects anything that escapes the directory, which neutralises traversal
    values such as ``../../etc/passwd`` if a row is ever tampered with.
    """
    if not row.pdf_filename:
        return None

    base = storage_dir()
    candidate = (base / row.pdf_filename).resolve()

    try:
        candidate.relative_to(base)
    except ValueError:
        logger.error("Rejected out-of-tree report path: %s", row.pdf_filename)
        return None

    return candidate


def _cached_pdf_is_usable(path: Optional[Path], report: Dict[str, Any]) -> bool:
    """Returns whether a cached PDF can safely be served as-is.

    Legacy Arabic PDFs could be cached after ReportLab silently substituted a
    Latin-only font, producing the square/``n`` glyphs seen in old downloads.
    Do not disturb any other cached report: only an explicitly Arabic report
    without the bundled Arabic font is rejected and re-rendered.
    """
    if not path or not path.exists():
        return False
    if normalize_language(report.get("language")) != "ar":
        return True

    try:
        return b"IBMPlexSansArabic" in path.read_bytes()
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class HistoryItem(BaseModel):
    id: int
    report_id: Optional[str] = None
    project_name: str
    audit_date: Optional[str] = None
    risk_score: Optional[int] = None
    risk_band: Optional[str] = None
    classification: Optional[str] = None
    report_type: Optional[str] = None
    mode: str
    summary_text: Optional[str] = None
    has_pdf: bool = False


class HistoryPage(BaseModel):
    items: List[HistoryItem]
    total: int
    page: int
    page_size: int
    has_more: bool


class ShareLink(BaseModel):
    """The public address of a shared report."""

    share_token: str
    share_url: str


def _to_item(row: AuditHistory) -> HistoryItem:
    score = row.risk_score
    return HistoryItem(
        id=row.id,
        report_id=row.report_id,
        project_name=row.project_or_platform_name,
        audit_date=row.created_at.isoformat() if row.created_at else None,
        risk_score=score,
        risk_band=risk_band(score)["key"] if score is not None else None,
        classification=row.classification,
        report_type=row.report_type or audit_type_for(row.mode),
        mode=row.mode,
        summary_text=row.summary_text,
        has_pdf=bool(row.pdf_filename),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("", response_model=HistoryPage)
def list_history(
    search: str = Query("", max_length=200),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    min_score: Optional[int] = Query(None, ge=0, le=100),
    max_score: Optional[int] = Query(None, ge=0, le=100),
    sort: str = Query("newest", pattern="^(newest|oldest|score_desc|score_asc|name)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns one page of the caller's own audit history."""
    query = db.query(AuditHistory).filter(AuditHistory.user_id == current_user.id)

    term = search.strip()
    if term:
        # SQLAlchemy parameterises this, so wildcards cannot break out of the
        # LIKE pattern into SQL.
        pattern = f"%{term}%"
        query = query.filter(
            or_(
                AuditHistory.project_or_platform_name.ilike(pattern),
                AuditHistory.classification.ilike(pattern),
                AuditHistory.report_id.ilike(pattern),
            )
        )

    parsed_from = _parse_date(date_from)
    if parsed_from:
        query = query.filter(AuditHistory.created_at >= parsed_from)

    parsed_to = _parse_date(date_to)
    if parsed_to:
        # Inclusive of the whole end day.
        query = query.filter(AuditHistory.created_at < parsed_to + timedelta(days=1))

    if min_score is not None:
        query = query.filter(AuditHistory.risk_score >= min_score)
    if max_score is not None:
        query = query.filter(AuditHistory.risk_score <= max_score)

    total = query.count()

    order = {
        "newest": AuditHistory.created_at.desc(),
        "oldest": AuditHistory.created_at.asc(),
        "score_desc": AuditHistory.risk_score.desc(),
        "score_asc": AuditHistory.risk_score.asc(),
        "name": AuditHistory.project_or_platform_name.asc(),
    }[sort]

    rows = (
        query.order_by(order)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return HistoryPage(
        items=[_to_item(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dates must be in ISO format (YYYY-MM-DD).",
        )


def _owned_row(audit_id: int, user: UserDB, db: Session) -> AuditHistory:
    """Fetches a row scoped to its owner, or raises an indistinguishable 404."""
    row = (
        db.query(AuditHistory)
        .filter(AuditHistory.id == audit_id, AuditHistory.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found."
        )
    return row


@router.get("/{audit_id}")
def get_audit(
    audit_id: int,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the full stored report for one audit."""
    row = _owned_row(audit_id, current_user, db)

    try:
        stored = json.loads(row.report_json) if row.report_json else {}
    except (TypeError, ValueError):
        logger.error("Corrupt report_json on audit %s", audit_id)
        stored = {}

    report = normalize_report(
        stored,
        report_id=row.report_id,
        audit_type=row.report_type or audit_type_for(row.mode),
        generated_at=row.created_at,
    )

    return {"item": _to_item(row), "report": report}


@router.get("/{audit_id}/pdf")
def download_pdf(
    audit_id: int,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Streams the report PDF, rendering it on demand if it is missing."""
    row = _owned_row(audit_id, current_user, db)

    try:
        stored = json.loads(row.report_json) if row.report_json else {}
    except (TypeError, ValueError):
        stored = {}

    path = _resolve_pdf_path(row)
    if _cached_pdf_is_usable(path, stored):
        pdf_bytes = path.read_bytes()
    else:
        # Older rows (and any row whose render failed) are recovered here so a
        # stored audit is always downloadable.
        try:
            pdf_bytes = build_audit_pdf(
                stored,
                report_id=row.report_id,
                audit_type=row.report_type or audit_type_for(row.mode),
                generated_at=row.created_at,
                language=stored.get("language"),
            )
        except Exception:
            logger.exception("On-demand PDF render failed for audit %s", audit_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="The report could not be generated.",
            )

        try:
            cache_path = path or (
                storage_dir()
                / (
                    f"{row.report_id or generate_report_id()}-"
                    f"{_safe_slug(row.project_or_platform_name)}.pdf"
                )
            )
            cache_path.write_bytes(pdf_bytes)
            row.pdf_filename = cache_path.name
            db.commit()
        except Exception:
            logger.warning("Could not cache regenerated PDF for audit %s", audit_id)
            db.rollback()

    download_name = f"Mizaan-Audit-{_safe_slug(row.project_or_platform_name)}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
            # Reports are per-user and private; never let a shared cache hold one.
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{audit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_audit(
    audit_id: int,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently removes one audit and its rendered PDF."""
    row = _owned_row(audit_id, current_user, db)

    _delete_pdf(row)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{audit_id}/share", response_model=ShareLink)
def share_audit(
    audit_id: int,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Publishes one audit behind an unguessable link and returns that link.

    Idempotent by design: an audit keeps the token it was first given, so a link
    already sent to somebody does not silently stop working the next time the
    owner shares the same report.
    """
    row = _owned_row(audit_id, current_user, db)

    if not row.share_token:
        row.share_token = _new_share_token()
        try:
            db.commit()
        except Exception:
            logger.exception("Could not create share link for audit %s", audit_id)
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="The share link could not be created.",
            )

    return ShareLink(
        share_token=row.share_token,
        share_url=f"{settings.frontend_url}/reports/{row.share_token}",
    )


@public_router.get("/{share_token}")
def read_shared_report(share_token: str, db: Session = Depends(get_db)):
    """Returns a shared report to anyone holding its link.

    Unauthenticated on purpose, and therefore deliberately narrow: it matches on
    the secret token alone, returns only the report document, and 404s for an
    audit that was never shared.
    """
    row = (
        db.query(AuditHistory)
        .filter(AuditHistory.share_token == share_token)
        .first()
    )
    # A token that is unknown and a report that was never shared are the same
    # answer, so this cannot be used to probe which links exist.
    if not row or not row.share_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found."
        )

    try:
        stored = json.loads(row.report_json) if row.report_json else {}
    except (TypeError, ValueError):
        logger.error("Corrupt report_json on shared audit %s", row.id)
        stored = {}

    report = normalize_report(
        stored,
        report_id=row.report_id,
        audit_type=row.report_type or audit_type_for(row.mode),
        generated_at=row.created_at,
    )

    return {"report": report}


@router.get("/{audit_id}/rerun-context")
def rerun_context(
    audit_id: int,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the inputs needed to pre-fill a re-run of this audit.

    Re-running deliberately goes through the normal audit endpoint so that the
    daily quota, validation and attachment handling all still apply.
    """
    row = _owned_row(audit_id, current_user, db)

    try:
        stored = json.loads(row.report_json) if row.report_json else {}
    except (TypeError, ValueError):
        stored = {}

    return {
        "project_or_platform_name": row.project_or_platform_name,
        "mode": row.mode,
        "token_ticker": stored.get("token_ticker") or "",
    }


__all__ = [
    "router",
    "public_router",
    "save_audit",
    "audit_type_for",
    "clamp_score",
]
