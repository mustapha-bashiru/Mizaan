"""Donations router.

This replaces the removed Paystack payment / subscription tier feature. Mizaan
no longer sells access: every verified account gets the same daily fair-use
quota. Donations are entirely voluntary and are handled off-platform, so the
backend never touches card data, payment secrets or webhooks.

The API exposes:
  * GET  /api/donations/info    - public donation configuration
  * GET  /api/donations/toggle  - the signed-in user's prompt preference
  * PUT  /api/donations/toggle  - update that preference
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from config import settings
from database import get_db
from models import UserDB

router = APIRouter(prefix="/api/donations", tags=["Donations"])


class DonationInfo(BaseModel):
    donations_enabled: bool
    donation_url: str
    note: str


class DonationToggle(BaseModel):
    donation_prompt_enabled: bool


@router.get("/info", response_model=DonationInfo)
def get_donation_info():
    """Public donation configuration used to render the donation banner."""
    return DonationInfo(
        donations_enabled=settings.donations_enabled,
        donation_url=settings.donation_url,
        note=settings.donation_note,
    )


@router.get("/toggle", response_model=DonationToggle)
def get_donation_preference(current_user: UserDB = Depends(get_current_user)):
    return DonationToggle(
        donation_prompt_enabled=bool(current_user.donation_prompt_enabled)
    )


@router.put("/toggle", response_model=DonationToggle)
def set_donation_preference(
    payload: DonationToggle,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lets a user hide or show the voluntary donation prompt."""
    current_user.donation_prompt_enabled = payload.donation_prompt_enabled
    db.commit()
    db.refresh(current_user)

    return DonationToggle(
        donation_prompt_enabled=bool(current_user.donation_prompt_enabled)
    )
