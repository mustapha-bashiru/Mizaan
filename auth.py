"""Authentication helpers: password hashing, JWT issuing and the current-user
dependency. All secrets come from the environment via ``config.settings``.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import UserDB

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if len(value) < settings.min_password_length:
            raise ValueError(
                f"Password must be at least {settings.min_password_length} "
                "characters long."
            )
        return value


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=4, max_length=12)


class ResendOTPRequest(BaseModel):
    email: EmailStr


class UserResponse(BaseModel):
    email: str
    analysis_count: int = 0
    is_verified: bool = True
    donation_prompt_enabled: bool = True

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def hash_otp(otp: str) -> str:
    """OTPs are stored hashed, never in plaintext."""
    return pwd_context.hash(otp)


def verify_otp(plain_otp: str, hashed_otp: Optional[str]) -> bool:
    if not hashed_otp:
        return False
    try:
        return pwd_context.verify(plain_otp, hashed_otp)
    except Exception:
        return False


def normalize_email(email: str) -> str:
    return email.strip().lower()


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def _require_secret() -> str:
    if not settings.jwt_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Server auth is not configured. Set JWT_SECRET_KEY in the "
                "environment."
            ),
        )
    return settings.jwt_secret_key


def create_access_token(
    user: UserDB, expires_delta: Optional[timedelta] = None
) -> str:
    """Issues a token keyed on the immutable user id (email may change)."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "exp": expire,
    }
    return jwt.encode(payload, _require_secret(), algorithm=settings.jwt_algorithm)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> UserDB:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token, _require_secret(), algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        raise credentials_exception

    subject = payload.get("sub")
    if not subject:
        raise credentials_exception

    user: Optional[UserDB] = None
    if subject.isdigit():
        user = db.query(UserDB).filter(UserDB.id == int(subject)).first()
    else:
        # Legacy tokens carried the email in `sub`.
        user = db.query(UserDB).filter(UserDB.email == subject).first()

    if user is None:
        raise credentials_exception

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please complete OTP verification.",
        )

    return user
