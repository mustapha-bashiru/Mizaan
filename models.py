"""SQLAlchemy ORM models.

Subscription / premium tiers were removed: the product is free for everyone
with a flat daily fair-use quota, plus an optional donation prompt.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from database import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now (naive-safe for SQLite storage)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    # Email verification
    is_verified = Column(Boolean, default=False, nullable=False)
    otp_hash = Column(String, nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    otp_attempts = Column(Integer, default=0, nullable=False)
    otp_last_sent_at = Column(DateTime, nullable=True)

    # Password reset
    reset_token_hash = Column(String, nullable=True)
    reset_expires_at = Column(DateTime, nullable=True)

    # Usage accounting (flat free tier — no premium flag)
    analysis_count = Column(Integer, default=0, nullable=False)
    daily_audit_count = Column(Integer, default=0, nullable=False)
    last_audit_date = Column(String, nullable=True)  # ISO date "YYYY-MM-DD"

    # Donation prompt preference (replaces the old upgrade/subscription CTA)
    donation_prompt_enabled = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=_utcnow, nullable=False)

    audits = relationship(
        "AuditHistory",
        back_populates="user",
        cascade="all, delete-orphan",
    )


# Emails are stored canonically (trimmed + lowercased by
# ``auth.normalize_email``). This functional index is the actual guarantee:
# even a caller that bypasses normalisation cannot create user@x.com alongside
# User@x.com, and concurrent inserts of the same address cannot both win.
Index("ix_users_email_lower_unique", func.lower(UserDB.email), unique=True)


class AuditHistory(Base):
    __tablename__ = "audit_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    # Retained for backwards compatibility with pre-existing rows.
    user_email = Column(String, index=True, nullable=True)

    project_or_platform_name = Column(String, index=True, nullable=False)
    mode = Column(String, nullable=False)
    summary_text = Column(Text, nullable=True)
    report_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow, index=True, nullable=False)

    # --- Audit history metadata -------------------------------------------
    # Denormalised from report_json so the history list can be searched,
    # filtered and sorted in SQL. Parsing every stored report to render one
    # page of history would not scale.
    report_id = Column(String, index=True, nullable=True)
    risk_score = Column(Integer, index=True, nullable=True)
    classification = Column(String, nullable=True)
    report_type = Column(String, nullable=True)

    # Relative filename only. The absolute path is resolved against
    # settings.report_storage_dir at download time so that stored rows can
    # never point outside the storage directory.
    pdf_filename = Column(String, nullable=True)

    # Opt-in public sharing. NULL until the owner explicitly shares the audit,
    # so archived reports stay private by default. The value is a high-entropy
    # random token rather than report_id, which is short enough to guess.
    share_token = Column(String, unique=True, index=True, nullable=True)

    user = relationship("UserDB", back_populates="audits")
