"""Central, environment-driven configuration for the Mizaan backend.

Every secret and deployment-specific value is read from the environment (or a
local .env file) so that nothing sensitive lives in source control.
"""

import os
from functools import lru_cache
from typing import List

from dotenv import load_dotenv

load_dotenv(override=True)


def _get_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _get_list(name: str, default: List[str]) -> List[str]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class Settings:
    """Runtime configuration resolved once at import time."""

    def __init__(self) -> None:
        # --- Core app ---------------------------------------------------
        self.app_name: str = os.getenv("APP_NAME", "Mizaan API")
        self.app_version: str = os.getenv("APP_VERSION", "1.4.0")
        self.environment: str = os.getenv("APP_ENV", "development").lower()

        # --- Database --------------------------------------------------
        self.database_url: str = os.getenv("DATABASE_URL", "sqlite:///./mizaan.db")

        # --- Auth ------------------------------------------------------
        self.jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "")
        self.jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes: int = _get_int(
            "ACCESS_TOKEN_EXPIRE_MINUTES", 1440
        )
        self.min_password_length: int = _get_int("MIN_PASSWORD_LENGTH", 8)

        # --- CORS ------------------------------------------------------
        self.cors_allow_origins: List[str] = _get_list(
            "CORS_ALLOW_ORIGINS",
            ["http://localhost:5173", "http://127.0.0.1:5173"],
        )
        self.frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

        # --- Usage quota ----------------------------------------------
        self.daily_audit_limit: int = _get_int("DAILY_AUDIT_LIMIT", 5)

        # --- Reports & branding ---------------------------------------
        # PDFs live outside the served frontend so the only way to read one is
        # through the authenticated, ownership-checked download endpoint.
        self.report_storage_dir: str = os.getenv(
            "REPORT_STORAGE_DIR", "./report_storage"
        )
        self.report_retention_limit: int = _get_int("REPORT_RETENTION_LIMIT", 100)
        self.brand_website: str = os.getenv("BRAND_WEBSITE", "www.mizaanai.co")
        self.brand_confidentiality_notice: str = os.getenv(
            "BRAND_CONFIDENTIALITY_NOTICE",
            "This document contains confidential AI-generated Shariah risk "
            "research prepared for the named recipient. It is not a fatwa and "
            "does not constitute financial, legal or investment advice. "
            "Redistribution without written consent is prohibited.",
        )

        # --- Email / OTP ----------------------------------------------
        self.smtp_host: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port: int = _get_int("SMTP_PORT", 465)
        self.smtp_sender_email: str = os.getenv("SMTP_SENDER_EMAIL", "")
        self.smtp_sender_password: str = os.getenv("SMTP_SENDER_PASSWORD", "")
        self.otp_ttl_minutes: int = _get_int("OTP_TTL_MINUTES", 10)
        self.otp_resend_cooldown_seconds: int = _get_int(
            "OTP_RESEND_COOLDOWN_SECONDS", 30
        )
        self.otp_max_attempts: int = _get_int("OTP_MAX_ATTEMPTS", 5)
        self.log_otp_to_console: bool = _get_bool("LOG_OTP_TO_CONSOLE", True)

        # --- AI engine -------------------------------------------------
        self.gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        self.gemini_api_key: str = (
            os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
        )

        # --- Upload / scraping limits ---------------------------------
        self.max_upload_files: int = _get_int("MAX_UPLOAD_FILES", 5)
        self.max_upload_bytes: int = _get_int("MAX_UPLOAD_BYTES", 10 * 1024 * 1024)
        self.max_document_chars: int = _get_int("MAX_DOCUMENT_CHARS", 12000)
        self.max_scrape_chars: int = _get_int("MAX_SCRAPE_CHARS", 15000)
        self.max_scrape_bytes: int = _get_int("MAX_SCRAPE_BYTES", 2 * 1024 * 1024)
        self.scrape_timeout_seconds: int = _get_int("SCRAPE_TIMEOUT_SECONDS", 5)
        self.max_question_chars: int = _get_int("MAX_QUESTION_CHARS", 4000)

        # --- Donations (replaces the removed subscription/payment flow) -
        self.donations_enabled: bool = _get_bool("DONATIONS_ENABLED", True)
        self.donation_url: str = os.getenv("DONATION_URL", "")
        self.donation_note: str = os.getenv(
            "DONATION_NOTE",
            "Mizaan is free to use. Voluntary donations (sadaqah) keep the "
            "research engine running. No subscription, no paywall.",
        )

    @property
    def is_production(self) -> bool:
        return self.environment in {"prod", "production"}

    def validate(self) -> List[str]:
        """Returns a list of human-readable configuration problems."""
        problems: List[str] = []

        if not self.jwt_secret_key:
            problems.append(
                "JWT_SECRET_KEY is not set. Generate one with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        elif len(self.jwt_secret_key) < 32:
            problems.append("JWT_SECRET_KEY should be at least 32 characters long.")

        if self.is_production and "*" in self.cors_allow_origins:
            problems.append(
                "CORS_ALLOW_ORIGINS must list explicit origins in production."
            )

        if not self.gemini_api_key:
            problems.append(
                "GEMINI_API_KEY is not set; audits will return fallback reports."
            )

        if not (self.smtp_sender_email and self.smtp_sender_password):
            problems.append(
                "SMTP credentials are not configured; verification codes will not "
                "be emailed (they are logged to the console in development)."
            )

        return problems


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
