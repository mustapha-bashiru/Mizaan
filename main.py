"""Mizaan FastAPI application.

Route surface:
  POST /api/register, /api/verify-otp, /api/resend-otp, /api/login
  GET  /api/profile
  POST /api/audit          (multipart: project intake + attachments)
  POST /api/scholar-chat   (JSON follow-up questions)
  GET  /api/settings/*, /api/donations/*, /api/history/*
  GET  /api/reports/{share_token}   (public, opt-in shared reports only)

The paid subscription flow was removed; access is free with a flat daily
fair-use quota and an optional donation prompt.
"""

from contextlib import asynccontextmanager
import logging
import secrets
from datetime import timedelta
from typing import List, Optional

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import (
    ResendOTPRequest,
    Token,
    UserRegister,
    UserResponse,
    VerifyOTPRequest,
    create_access_token,
    get_current_user,
    get_password_hash,
    hash_otp,
    normalize_email,
    verify_otp,
    verify_password,
)
from config import settings
from database import get_db
from donations import router as donations_router
from history import (
    public_router as public_reports_router,
    router as history_router,
    save_audit,
)
from migrations import run_migrations
from models import UserDB
from pipeline import analyze_project, ask_scholar_ai
from services import (
    assert_quota_available,
    consume_audit_credit,
    otp_resend_allowed,
    process_attachments,
    remaining_audits,
    send_otp_email,
    utcnow,
    verify_token_details,
)
from settings import router as settings_router
from password_reset import router as password_reset_router
from utils import fetch_live_url_content

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("mizaan")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Execute startup logic
    applied = run_migrations()
    for change in applied:
        logger.info("Migration applied: %s", change)

    for problem in settings.validate():
        logger.warning("Configuration: %s", problem)

    yield  # The FastAPI application runs while paused here

    # Code after yield runs on shutdown (if needed in the future)


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(settings_router)
app.include_router(donations_router)
app.include_router(history_router)
app.include_router(public_reports_router)
app.include_router(password_reset_router)

# Serve frontend static files from dist/ (React build output)
dist_path = Path(__file__).parent / "halal-crypto-ui" / "dist"
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="static")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    audit_context: str = ""

    def truncated_question(self) -> str:
        return self.question[: settings.max_question_chars]

    def truncated_context(self) -> str:
        return self.audit_context[: settings.max_document_chars]


def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _issue_otp(user: UserDB) -> str:
    otp = _generate_otp()
    user.otp_hash = hash_otp(otp)
    user.otp_expires_at = utcnow() + timedelta(minutes=settings.otp_ttl_minutes)
    user.otp_attempts = 0
    user.otp_last_sent_at = utcnow()
    return otp


# Duplicate-registration copy. Split by verification state so the caller knows
# whether to log in or finish verifying, rather than getting one vague error.
EMAIL_TAKEN_VERIFIED = (
    "An account with this email already exists. "
    "Please log in or use the Forgot Password option."
)
EMAIL_TAKEN_UNVERIFIED = (
    "This email has already been registered but not verified. "
    "Please verify your email or request a new OTP."
)


def _duplicate_email_conflict(existing: UserDB) -> HTTPException:
    """409 for an email that is already taken.

    The account is never overwritten and no OTP is issued here: an unverified
    signup continues through /api/resend-otp, which keeps its own rate limit.

    ``detail`` carries a stable ``code`` alongside the message so the frontend
    can localise and branch without string-matching English prose.
    """
    verified = bool(existing.is_verified)
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "email_exists_verified" if verified else "email_exists_unverified",
            "message": EMAIL_TAKEN_VERIFIED if verified else EMAIL_TAKEN_UNVERIFIED,
        },
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.app_name,
        "version": settings.app_version,
        "pricing": "free",
    }


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.post("/api/register", status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    # Emails are canonicalised (trimmed + lowercased) before any lookup or
    # insert, so user@x.com / User@x.com / USER@X.COM are the same account.
    email = normalize_email(user_data.email)

    existing = db.query(UserDB).filter(UserDB.email == email).first()
    if existing:
        raise _duplicate_email_conflict(existing)

    user = UserDB(
        email=email,
        hashed_password=get_password_hash(user_data.password),
        is_verified=False,
    )
    otp = _issue_otp(user)
    db.add(user)

    try:
        db.commit()
    except IntegrityError:
        # Two concurrent signups for the same address: the unique index on the
        # email column rejects the loser, which is reported as a normal 409
        # instead of a 500.
        db.rollback()
        existing = db.query(UserDB).filter(UserDB.email == email).first()
        if existing:
            raise _duplicate_email_conflict(existing) from None
        logger.exception("Registration failed for %s", email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration could not be completed. Please try again.",
        ) from None

    delivered = send_otp_email(email, otp)

    return {
        "message": "Verification code sent. Please check your inbox.",
        "email": email,
        "email_delivered": delivered,
    }


@app.post("/api/resend-otp")
def resend_otp(payload: ResendOTPRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    user = db.query(UserDB).filter(UserDB.email == email).first()

    # Generic response: never reveal whether an account exists.
    generic = {"message": "If that account exists, a new code has been sent."}

    if not user or user.is_verified:
        return generic

    if not otp_resend_allowed(user):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait a moment before requesting another code.",
        )

    otp = _issue_otp(user)
    db.commit()
    send_otp_email(email, otp)
    return generic


@app.post("/api/verify-otp", response_model=Token)
def verify_otp_endpoint(payload: VerifyOTPRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    user = db.query(UserDB).filter(UserDB.email == email).first()

    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired verification code.",
    )

    if not user or not user.otp_hash or not user.otp_expires_at:
        raise invalid

    if user.otp_attempts >= settings.otp_max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. Please request a new code.",
        )

    # Expiry is reported distinctly from "wrong code". A user who waited too
    # long needs to be told to request a new code; folding that into the generic
    # error sends them retrying a code that can never work. The disclosure is
    # limited to the fact that a code was issued and has lapsed, which the user
    # already knows, and it is only reachable after the attempt-limit check.
    if utcnow() > user.otp_expires_at:
        # Clear the dead secret so it cannot be replayed if the clock or the
        # row is later manipulated.
        user.otp_hash = None
        user.otp_expires_at = None
        user.otp_attempts = 0
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification code has expired. Please request a new one.",
        )


    if not verify_otp(payload.otp.strip(), user.otp_hash):
        user.otp_attempts = (user.otp_attempts or 0) + 1
        db.commit()
        raise invalid

    user.is_verified = True
    user.otp_hash = None
    user.otp_expires_at = None
    user.otp_attempts = 0
    db.commit()
    db.refresh(user)

    return Token(access_token=create_access_token(user), token_type="bearer")


@app.post("/api/login", response_model=Token)
def login(user_data: UserRegister, db: Session = Depends(get_db)):
    email = normalize_email(user_data.email)
    user = db.query(UserDB).filter(UserDB.email == email).first()

    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your account to continue.",
        )

    return Token(access_token=create_access_token(user), token_type="bearer")


@app.get("/api/profile", response_model=UserResponse)
def get_profile(current_user: UserDB = Depends(get_current_user)):
    return UserResponse(
        email=current_user.email,
        analysis_count=current_user.analysis_count or 0,
        is_verified=bool(current_user.is_verified),
        donation_prompt_enabled=bool(current_user.donation_prompt_enabled),
    )


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------
@app.post("/api/audit")
async def run_audit(
    project_or_platform_name: str = Form(...),
    mode: str = Form("crypto"),
    token_ticker: str = Form(""),
    category: str = Form(""),
    revenue_model: str = Form(""),
    docs_summary: str = Form(""),
    live_url: str = Form(""),
    language: str = Form("en"),
    files: Optional[List[UploadFile]] = File(None),
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Runs a Shariah audit. The daily quota is charged only on success."""
    assert_quota_available(current_user, db)

    warnings: List[str] = []

    attachment_text, images, file_warnings = await process_attachments(files)
    warnings.extend(file_warnings)

    scraped_text = ""
    if live_url.strip():
        scraped_text, scrape_error = fetch_live_url_content(live_url)
        if scrape_error:
            warnings.append(f"Live URL: {scrape_error}")

    ticker = token_ticker.strip()
    if mode == "crypto" and not ticker:
        market = verify_token_details(project_or_platform_name)
        if market:
            ticker = market["verified_symbol"]

    combined_context = "\n\n".join(
        part for part in (docs_summary.strip(), attachment_text, scraped_text) if part
    )[: settings.max_document_chars]

    outcome = analyze_project(
        project_name=project_or_platform_name.strip(),
        token_ticker=ticker or "N/A",
        protocol_type=category.strip() or mode,
        revenue_model_description=revenue_model.strip(),
        whitepaper_or_docs_summary=combined_context,
        images=images,
        language=language,
    )

    if not outcome.ok or not outcome.report:
        # 502: the failure is upstream, not the client's fault. No quota charged.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=outcome.error_message or "The audit could not be generated.",
        )

    report = outcome.report
    consume_audit_credit(current_user, db)

    # Archiving is best-effort: the audit has already been generated and the
    # quota charged, so a storage failure must not lose the user's result.
    saved = save_audit(
        db,
        current_user,
        project_name=project_or_platform_name.strip(),
        mode=mode,
        report=report,
        language=language,
    )

    return {
        "report": report,
        "audit_id": saved.id if saved else None,
        "report_id": saved.report_id if saved else None,
        "warnings": warnings,
        "analyses_remaining": remaining_audits(current_user),
        "daily_audit_limit": settings.daily_audit_limit,
    }


# Backwards-compatible alias for older frontend builds.
app.post("/api/analyze", include_in_schema=False)(run_audit)


# ---------------------------------------------------------------------------
# Scholar chat
# ---------------------------------------------------------------------------
@app.post("/api/scholar-chat")
def scholar_chat(
    payload: ChatRequest,
    current_user: UserDB = Depends(get_current_user),
):
    outcome = ask_scholar_ai(
        question=payload.truncated_question(),
        audit_context=payload.truncated_context(),
    )

    if not outcome.ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=outcome.error_message or "The assistant is unavailable.",
        )

    return {"reply": outcome.reply}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)