"""Safe outbound fetching utilities.

The live URL scraper is exposed to authenticated users, so it must not be
usable as a server-side request forgery (SSRF) primitive. Every hop is
validated: scheme, resolved IP range, redirect targets, content type and
response size.
"""

import ipaddress
import logging
import socket
from typing import List, Optional, Tuple
from urllib.parse import urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger(__name__)

_ALLOWED_SCHEMES = {"http", "https"}
_ALLOWED_CONTENT_TYPES = ("text/html", "text/plain", "application/xhtml+xml")
_MAX_REDIRECTS = 3

_USER_AGENT = (
    "Mozilla/5.0 (compatible; MizaanAI-ComplianceBot/1.0; "
    "+https://example.invalid/mizaan-bot)"
)


class UnsafeURLError(ValueError):
    """Raised when a URL is rejected before any request is made."""


def _is_blocked_ip(ip: str) -> bool:
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return True

    return (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def _resolve_host(host: str) -> List[str]:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise UnsafeURLError(f"Could not resolve host '{host}'.") from exc
    return sorted({info[4][0] for info in infos})


def validate_public_url(url: str) -> str:
    """Validates scheme/host/IP and returns the normalized URL."""
    if not url or not url.strip():
        raise UnsafeURLError("No URL provided.")

    parsed = urlparse(url.strip())

    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise UnsafeURLError("Only http and https URLs are supported.")

    if not parsed.hostname:
        raise UnsafeURLError("URL is missing a hostname.")

    hostname = parsed.hostname.lower()

    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(
        (".localhost", ".internal", ".local")
    ):
        raise UnsafeURLError("Internal hostnames are not allowed.")

    for ip in _resolve_host(hostname):
        if _is_blocked_ip(ip):
            raise UnsafeURLError(
                "URL resolves to a private or reserved address, which is "
                "not permitted."
            )

    # Strip credentials and fragments from the outgoing request.
    netloc = hostname if parsed.port is None else f"{hostname}:{parsed.port}"
    return urlunparse(
        (parsed.scheme.lower(), netloc, parsed.path or "/", parsed.params, parsed.query, "")
    )


def _read_capped_body(response: requests.Response, max_bytes: int) -> str:
    chunks: List[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=8192):
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            logger.info("Truncating scraped body at %s bytes", max_bytes)
            break
        chunks.append(chunk)

    encoding = response.encoding or "utf-8"
    return b"".join(chunks).decode(encoding, errors="ignore")


def _extract_text(html: str, max_chars: int) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for element in soup(
        ["script", "style", "noscript", "nav", "footer", "header", "svg", "iframe"]
    ):
        element.decompose()
    text = soup.get_text(separator=" ", strip=True)
    return text[:max_chars]


def fetch_live_url_content(url: str) -> Tuple[str, Optional[str]]:
    """Fetches readable text from a public URL.

    Returns ``(text, error_message)``. ``text`` is empty when the fetch was
    rejected or failed; ``error_message`` is a short, user-safe explanation.
    """
    try:
        current_url = validate_public_url(url)
    except UnsafeURLError as exc:
        return "", str(exc)

    session = requests.Session()
    session.max_redirects = _MAX_REDIRECTS

    try:
        for _ in range(_MAX_REDIRECTS + 1):
            response = session.get(
                current_url,
                headers={"User-Agent": _USER_AGENT, "Accept": "text/html,text/plain"},
                timeout=settings.scrape_timeout_seconds,
                allow_redirects=False,
                stream=True,
            )

            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                response.close()
                if not location:
                    return "", "The URL redirected without a destination."
                try:
                    current_url = validate_public_url(
                        requests.compat.urljoin(current_url, location)
                    )
                except UnsafeURLError as exc:
                    return "", f"Blocked redirect: {exc}"
                continue

            with response:
                if response.status_code != 200:
                    return "", (
                        f"The source returned HTTP {response.status_code}."
                    )

                content_type = response.headers.get("Content-Type", "").lower()
                if content_type and not any(
                    allowed in content_type for allowed in _ALLOWED_CONTENT_TYPES
                ):
                    return "", "Only HTML or plain-text pages can be analysed."

                declared_length = response.headers.get("Content-Length")
                if (
                    declared_length
                    and declared_length.isdigit()
                    and int(declared_length) > settings.max_scrape_bytes
                ):
                    return "", "The page is too large to analyse."

                body = _read_capped_body(response, settings.max_scrape_bytes)

            text = _extract_text(body, settings.max_scrape_chars)
            if not text:
                return "", "No readable text was found at that URL."
            return text, None

        return "", "Too many redirects."

    except requests.Timeout:
        return "", "The source took too long to respond."
    except requests.RequestException as exc:
        logger.info("Scrape failed for %s: %s", url, exc)
        return "", "The source could not be reached."
    finally:
        session.close()
