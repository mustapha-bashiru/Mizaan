"""Account settings router (profile, preferences and account deletion).

Subscription/tier information was removed with the payments feature; the
response now reports the flat daily fair-use allowance and the donation
prompt preference instead.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session


from auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    normalize_email,
    verify_password,
)
from config import settings as app_settings
from database import get_db
from history import delete_stored_pdfs_for_user
from models import UserDB
from services import remaining_audits

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["Settings"])


class ProfileUpdate(BaseModel):
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, max_length=256)
    donation_prompt_enabled: Optional[bool] = None

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if len(value) < app_settings.min_password_length:
            raise ValueError(
                f"Password must be at least {app_settings.min_password_length} "
                "characters long."
            )
        return value


class AccountDeleteRequest(BaseModel):
    """Deletion is irreversible, so the caller must re-prove ownership.

    Requiring the password here means a leaked or borrowed session token is not
    on its own enough to destroy an account.
    """

    current_password: str


class ProfileResponse(BaseModel):

    message: str
    email: str
    daily_audit_limit: int
    analyses_remaining: int
    donation_prompt_enabled: bool
    # Present only when the email changed and the old token became invalid.
    access_token: Optional[str] = None


@router.get("/profile", response_model=ProfileResponse)
def read_user_profile(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    remaining = remaining_audits(current_user)
    db.commit()

    return ProfileResponse(
        message="Profile loaded",
        email=current_user.email,
        daily_audit_limit=app_settings.daily_audit_limit,
        analyses_remaining=remaining,
        donation_prompt_enabled=bool(current_user.donation_prompt_enabled),
    )


@router.put("/profile", response_model=ProfileResponse)
def update_user_profile(
    payload: ProfileUpdate,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    email_changed = False

    # 1. Email change (requires the current password to prove ownership).
    if payload.email:
        new_email = normalize_email(payload.email)
        if new_email != current_user.email:
            if not payload.current_password or not verify_password(
                payload.current_password, current_user.hashed_password
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Your current password is required to change the email address.",
                )

            existing = (
                db.query(UserDB).filter(UserDB.email == new_email).first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email is already in use by another account.",
                )

            current_user.email = new_email
            email_changed = True

    # 2. Password change.
    if payload.new_password:
        if not payload.current_password or not verify_password(
            payload.current_password, current_user.hashed_password
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect current password provided.",
            )
        current_user.hashed_password = get_password_hash(payload.new_password)

    # 3. Donation prompt preference.
    if payload.donation_prompt_enabled is not None:
        current_user.donation_prompt_enabled = payload.donation_prompt_enabled

    db.commit()
    db.refresh(current_user)

    remaining = remaining_audits(current_user)
    db.commit()

    return ProfileResponse(
        message="Profile updated successfully",
        email=current_user.email,
        daily_audit_limit=app_settings.daily_audit_limit,
        analyses_remaining=remaining,
        donation_prompt_enabled=bool(current_user.donation_prompt_enabled),
        # Tokens carry the email claim, so hand back a fresh one on change.
        access_token=create_access_token(current_user) if email_changed else None,
    )


# POST rather than DELETE: the request must carry the confirming password in a
# body, and some proxies and HTTP clients silently drop bodies on DELETE.
@router.post("/account/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(

    payload: AccountDeleteRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently deletes the caller's account and all data derived from it.

    Order matters. The rendered PDFs are removed first, while the history rows
    that name them are still present; deleting the user row afterwards cascades
    to those rows (``UserDB.audits`` is ``all, delete-orphan``), which clears the
    audit history, the stored report JSON and the OTP/reset-token columns along
    with it.

    The endpoint is idempotent from the client's perspective: once it returns
    204 the session token still exists but no longer resolves to a user, so the
    frontend logs out and every subsequent authenticated call fails closed.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password. Your account has not been deleted.",
        )

    # Best-effort: an unreadable file on disk must not strand the account in a
    # half-deleted state, so failures here are logged inside the helper.
    removed = delete_stored_pdfs_for_user(db, current_user)

    user_id = current_user.id
    db.delete(current_user)
    db.commit()

    # Deliberately logs the id rather than the email: the account is gone, and
    # retaining the address in application logs would defeat the deletion.
    logger.info("Deleted account %s and %s stored report(s).", user_id, removed)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


