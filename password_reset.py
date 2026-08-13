from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import UserDB
from auth import get_password_hash, pwd_context
from services import send_password_reset_email

router = APIRouter(prefix="/api/password-reset", tags=["Password Reset"])


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    token: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=1)


@router.post("/request")
def request_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == payload.email.lower()).first()
    if not user:
        # Do not reveal whether the email exists.
        return {"ok": True}

    token = secrets.token_urlsafe(24)
    token_hash = pwd_context.hash(token)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)

    user.reset_token_hash = token_hash
    user.reset_expires_at = expires.replace(tzinfo=None)
    db.add(user)
    db.commit()

    try:
        send_password_reset_email(user.email, token)
    except Exception:
        # Do not expose email errors to callers; log on server instead.
        pass

    return {"ok": True}


@router.post("/confirm")
def confirm_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == payload.email.lower()).first()
    if not user or not user.reset_token_hash or not user.reset_expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    # Check expiry
    if datetime.now(timezone.utc).replace(tzinfo=None) > user.reset_expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    if not pwd_context.verify(payload.token, user.reset_token_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    # Update password
    user.hashed_password = get_password_hash(payload.new_password)
    user.reset_token_hash = None
    user.reset_expires_at = None
    db.add(user)
    db.commit()

    return {"ok": True}
