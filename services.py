"""Backend service helpers: attachment parsing, OTP email dispatch, quota
enforcement and market lookup. Keeping these out of the route handlers makes
``main.py`` readable and the individual pieces testable.
"""

import io
import html
import logging
import smtplib
import ssl
from datetime import date, datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional, Tuple
from urllib.parse import urlencode

import docx
import PIL.Image
import pypdf
import requests
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from config import settings
from models import UserDB

logger = logging.getLogger(__name__)

_TEXT_EXTENSIONS = (".txt", ".md")
_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
_ALLOWED_EXTENSIONS = (".pdf", ".docx") + _TEXT_EXTENSIONS + _IMAGE_EXTENSIONS

# Magic-number prefixes used to confirm the declared extension.
_SIGNATURES = {
    ".pdf": [b"%PDF-"],
    ".docx": [b"PK\x03\x04"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".webp": [b"RIFF"],
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------
def _matches_signature(extension: str, content: bytes) -> bool:
    expected = _SIGNATURES.get(extension)
    if not expected:
        return True  # plain text has no reliable signature
    return any(content.startswith(prefix) for prefix in expected)


async def process_attachments(
    files: Optional[List[UploadFile]] = None,
) -> Tuple[str, list, List[str]]:
    """Extracts text and images from uploads.

    Returns ``(extracted_text, image_objects, warnings)``. Invalid files are
    skipped with a user-facing warning rather than failing the whole audit.
    """
    extracted_text = ""
    image_parts: list = []
    warnings: List[str] = []

    real_files = [f for f in (files or []) if f and f.filename]
    if not real_files:
        return extracted_text, image_parts, warnings

    if len(real_files) > settings.max_upload_files:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Too many files. A maximum of {settings.max_upload_files} "
                "attachments is allowed per audit."
            ),
        )

    for file in real_files:
        filename = file.filename
        lowered = filename.lower()
        extension = next(
            (ext for ext in _ALLOWED_EXTENSIONS if lowered.endswith(ext)), None
        )

        if extension is None:
            warnings.append(f"'{filename}' was skipped: unsupported file type.")
            continue

        content = await file.read()

        if len(content) > settings.max_upload_bytes:
            limit_mb = settings.max_upload_bytes / (1024 * 1024)
            warnings.append(
                f"'{filename}' was skipped: larger than {limit_mb:.0f} MB."
            )
            continue

        if not _matches_signature(extension, content):
            warnings.append(
                f"'{filename}' was skipped: file contents do not match its "
                f"'{extension}' extension."
            )
            continue

        if extension == ".pdf":
            text = _read_pdf(content, filename, warnings)
            if text:
                extracted_text += f"\n\n--- [ATTACHED PDF: {filename}] ---\n{text}"

        elif extension == ".docx":
            text = _read_docx(content, filename, warnings)
            if text:
                extracted_text += f"\n\n--- [ATTACHED DOCX: {filename}] ---\n{text}"

        elif extension in _TEXT_EXTENSIONS:
            decoded = content.decode("utf-8", errors="ignore")
            extracted_text += f"\n\n--- [ATTACHED TEXT: {filename}] ---\n{decoded}"

        elif extension in _IMAGE_EXTENSIONS:
            image = _read_image(content, filename, warnings)
            if image is not None:
                image_parts.append(image)

    return extracted_text, image_parts, warnings


def _read_pdf(content: bytes, filename: str, warnings: List[str]) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages[:100]:  # cap pages to bound CPU cost
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n".join(pages)
    except Exception as exc:
        logger.info("Failed to parse PDF %s: %s", filename, exc)
        warnings.append(f"'{filename}' could not be read as a PDF.")
        return ""


def _read_docx(content: bytes, filename: str, warnings: List[str]) -> str:
    try:
        document = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in document.paragraphs if p.text.strip())
    except Exception as exc:
        logger.info("Failed to parse DOCX %s: %s", filename, exc)
        warnings.append(f"'{filename}' could not be read as a Word document.")
        return ""


def _read_image(content: bytes, filename: str, warnings: List[str]):
    try:
        image = PIL.Image.open(io.BytesIO(content))
        image.verify()  # guards against malformed/decompression-bomb images
        image = PIL.Image.open(io.BytesIO(content))
        image.thumbnail((2048, 2048))
        return image
    except Exception as exc:
        logger.info("Failed to load image %s: %s", filename, exc)
        warnings.append(f"'{filename}' could not be read as an image.")
        return None


# ---------------------------------------------------------------------------
# OTP email
# ---------------------------------------------------------------------------
def send_otp_email(to_email: str, otp: str) -> bool:
    """Sends the verification code. Returns True when delivery succeeded."""
    if settings.log_otp_to_console and not settings.is_production:
        logger.warning("DEV ONLY - verification code for %s: %s", to_email, otp)

    if not (settings.smtp_sender_email and settings.smtp_sender_password):
        logger.warning("SMTP is not configured; verification email not sent.")
        return False

    message = MIMEMultipart("alternative")
    message["Subject"] = "Your Mizaan AI Verification Code"
    message["From"] = settings.smtp_sender_email
    message["To"] = to_email

    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f4f4f5; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px;">
          <h2 style="color: #0d9488;">Welcome to Mizaan AI</h2>
          <p style="color: #3f3f46; font-size: 16px;">Your email verification code is:</p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
            <h1 style="color: #16a34a; letter-spacing: 6px; margin: 0;">{otp}</h1>
          </div>
          <p style="color: #71717a; font-size: 14px;">
            This code expires in {settings.otp_ttl_minutes} minutes. If you did
            not request it, you can ignore this email.
          </p>
        </div>
      </body>
    </html>
    """
    message.attach(MIMEText(html, "html"))

    try:
        context = ssl.create_default_context()
        if settings.smtp_port == 465:
            # Port 465 negotiates TLS before SMTP commands are exchanged.
            with smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, context=context, timeout=10
            ) as server:
                server.login(settings.smtp_sender_email, settings.smtp_sender_password)
                server.sendmail(
                    settings.smtp_sender_email, to_email, message.as_string()
                )
        else:
            # Port 587 (and most non-Gmail submission ports) use STARTTLS.
            with smtplib.SMTP(
                settings.smtp_host, settings.smtp_port, timeout=10
            ) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(settings.smtp_sender_email, settings.smtp_sender_password)
                server.sendmail(
                    settings.smtp_sender_email, to_email, message.as_string()
                )
        return True
    except Exception as exc:
        logger.error(
            "Failed to dispatch verification email via %s:%s to %s (%s): %s",
            settings.smtp_host,
            settings.smtp_port,
            to_email,
            type(exc).__name__,
            exc,
        )
        return False


def send_password_reset_email(to_email: str, token: str) -> bool:
    """Sends a password reset link to the user."""
    if settings.log_otp_to_console and not settings.is_production:
        logger.warning("DEV ONLY - password reset token for %s: %s", to_email, token)

    if not (settings.smtp_sender_email and settings.smtp_sender_password):
        logger.error("SMTP is not configured; password reset email not sent.")
        return False

    query = urlencode({"email": to_email, "token": token})
    link = f"{settings.frontend_url}/reset-password?{query}"
    escaped_link = html.escape(link, quote=True)

    message = MIMEMultipart("alternative")
    message["Subject"] = "Mizaan AI password reset"
    message["From"] = settings.smtp_sender_email
    message["To"] = to_email

    body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f4f4f5; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px;">
          <h2 style="color: #0d9488;">Mizaan AI password reset</h2>
          <p style="color: #3f3f46; font-size: 16px;">Click the button below to reset your password. This link expires in 1 hour.</p>
          <div style="margin: 20px 0; text-align:center;">
            <a href="{escaped_link}" style="display:inline-block; background:#16a34a; color:white; padding:12px 20px; border-radius:6px; text-decoration:none;">Reset password</a>
          </div>
          <p style="color:#71717a; font-size:12px;">Or paste this link into your browser: {escaped_link}</p>
        </div>
      </body>
    </html>
    """
    message.attach(MIMEText(body, "html"))

    try:
        context = ssl.create_default_context()
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, context=context, timeout=10
            ) as server:
                server.login(settings.smtp_sender_email, settings.smtp_sender_password)
                server.sendmail(settings.smtp_sender_email, to_email, message.as_string())
        else:
            with smtplib.SMTP(
                settings.smtp_host, settings.smtp_port, timeout=10
            ) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(settings.smtp_sender_email, settings.smtp_sender_password)
                server.sendmail(settings.smtp_sender_email, to_email, message.as_string())
        return True
    except Exception as exc:
        logger.error(
            "Failed to dispatch password reset email via %s:%s to %s (%s): %s",
            settings.smtp_host,
            settings.smtp_port,
            to_email,
            type(exc).__name__,
            exc,
        )
        return False


# ---------------------------------------------------------------------------
# Quota
# ---------------------------------------------------------------------------
def reset_quota_if_new_day(user: UserDB) -> None:
    today = date.today().isoformat()
    if user.last_audit_date != today:
        user.last_audit_date = today
        user.daily_audit_count = 0


def remaining_audits(user: UserDB) -> int:
    reset_quota_if_new_day(user)
    return max(0, settings.daily_audit_limit - (user.daily_audit_count or 0))


def assert_quota_available(user: UserDB, db: Session) -> None:
    """Raises 429 when today's fair-use limit is exhausted.

    The counter is incremented only after the audit succeeds (see
    ``consume_audit_credit``) so failed audits are not charged.
    """
    reset_quota_if_new_day(user)
    db.commit()

    if (user.daily_audit_count or 0) >= settings.daily_audit_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Daily fair-use limit of {settings.daily_audit_limit} audits "
                "reached. Please try again tomorrow."
            ),
        )


def consume_audit_credit(user: UserDB, db: Session) -> None:
    """Charges one audit after successful generation."""
    reset_quota_if_new_day(user)
    user.daily_audit_count = (user.daily_audit_count or 0) + 1
    user.analysis_count = (user.analysis_count or 0) + 1
    db.commit()


# ---------------------------------------------------------------------------
# OTP throttling
# ---------------------------------------------------------------------------
def otp_resend_allowed(user: UserDB, cooldown_seconds: Optional[int] = None) -> bool:
    if cooldown_seconds is None:
        cooldown_seconds = settings.otp_resend_cooldown_seconds
    if not user.otp_last_sent_at:
        return True
    return utcnow() - user.otp_last_sent_at >= timedelta(seconds=cooldown_seconds)


# ---------------------------------------------------------------------------
# Market lookup
# ---------------------------------------------------------------------------
def verify_token_details(project_name: str) -> Optional[dict]:
    """Best-effort CoinGecko lookup to auto-complete a ticker symbol."""
    try:
        response = requests.get(
            "https://api.coingecko.com/api/v3/search",
            params={"query": project_name},
            timeout=3,
        )
        response.raise_for_status()
        coins = response.json().get("coins", [])
        if coins:
            top = coins[0]
            return {
                "verified_name": top.get("name", ""),
                "verified_symbol": (top.get("symbol") or "").upper(),
                "id": top.get("id", ""),
            }
    except Exception as exc:
        logger.info("CoinGecko lookup failed for %s: %s", project_name, exc)
    return None
