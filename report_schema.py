"""Canonical shape for an audit report, independent of who produced it.

Reports reach the PDF renderer and the history API from three different eras:

* current audits, which follow ``pipeline.CryptoRiskReport`` exactly;
* rows written before recommendations/references were structured, where
  ``actionable_recommendations`` was a list of plain strings; and
* rows written before the report carried a verdict, classification or
  ``report_id`` at all.

Rather than sprinkling ``isinstance`` checks through the renderer and the API,
every consumer calls :func:`normalize_report` once and then works with a single
predictable dictionary. Nothing here talks to the database or the AI provider,
so it stays cheap to unit test.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from report_i18n import Localizer

# Risk bands shared by the PDF, the API and the UI. Keep these in one place so
# a threshold change cannot drift between surfaces.
RISK_BANDS = (
    (20, "LOW", "Low Risk"),
    (40, "MODERATE", "Moderate Risk"),
    (70, "ELEVATED", "Elevated Risk"),
    (100, "HIGH", "High Risk"),
)

NO_REFERENCES_TEXT = "No relevant primary references identified."

_PRIORITY_ALIASES = {
    "high": "HIGH",
    "critical": "HIGH",
    "urgent": "HIGH",
    "medium": "MEDIUM",
    "moderate": "MEDIUM",
    "low": "LOW",
}

_RISK_LEVEL_ALIASES = {
    "low": "LOW",
    "moderate": "MODERATE",
    "medium": "MODERATE",
    "elevated": "HIGH",
    "high": "HIGH",
    "critical": "CRITICAL",
}

# Indicator status -> badge semantics used by both the PDF and the web report.
COMPLIANT = "COMPLIANT"
CONDITIONAL = "CONDITIONAL"
NON_COMPLIANT = "NON_COMPLIANT"


def generate_report_id() -> str:
    """Server-side report identifier.

    The AI is never trusted to mint identifiers: a model-supplied value could
    collide with, or deliberately impersonate, another report.
    """
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"MZN-{stamp}-{secrets.token_hex(3).upper()}"


def clamp_score(value: Any) -> int:
    """Coerces any provider value into the documented 0-100 range."""
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, score))


def clamp_confidence(value: Any) -> Optional[float]:
    """Confidence is optional; only real 0.0-1.0 values survive."""
    if value is None:
        return None
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return None
    if confidence > 1 and confidence <= 100:
        # Some responses report a percentage instead of a fraction.
        confidence = confidence / 100
    return max(0.0, min(1.0, confidence))


def risk_band(score: Any) -> Dict[str, str]:
    """Maps a score onto its band key and human label."""
    value = clamp_score(score)
    for upper, key, label in RISK_BANDS:
        if value <= upper:
            return {"score": value, "key": key, "label": label}
    return {"score": value, "key": "HIGH", "label": "High Risk"}


def status_badge(status: Any) -> str:
    """Classifies a free-text indicator status into a badge colour bucket."""
    text = str(status or "").strip().lower()

    if not text:
        return CONDITIONAL

    non_compliant_markers = ("non-compliant", "non compliant", "fail", "prohibited")
    if any(marker in text for marker in non_compliant_markers):
        return NON_COMPLIANT

    conditional_markers = (
        "conditional",
        "warning",
        "review",
        "caution",
        "partial",
        "unclear",
    )
    if any(marker in text for marker in conditional_markers):
        return CONDITIONAL

    compliant_markers = ("compliant", "pass", "permissible", "halal")
    if any(marker in text for marker in compliant_markers):
        return COMPLIANT

    return CONDITIONAL


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _string_list(value: Any) -> List[str]:
    """Accepts a list, a single string, or nothing."""
    if value is None:
        return []
    if isinstance(value, str):
        cleaned = value.strip()
        return [cleaned] if cleaned else []
    if isinstance(value, dict):
        value = value.values()
    if not isinstance(value, Iterable):
        return []

    items: List[str] = []
    for item in value:
        if isinstance(item, dict):
            text = _clean_text(
                item.get("text")
                or item.get("recommendation")
                or item.get("finding")
                or item.get("description")
            )
        else:
            text = _clean_text(item)
        if text:
            items.append(text)
    return items


def _normalize_priority(value: Any) -> str:
    return _PRIORITY_ALIASES.get(str(value or "").strip().lower(), "MEDIUM")


def _normalize_risk_level(value: Any, fallback: str) -> str:
    key = str(value or "").strip().lower()
    return _RISK_LEVEL_ALIASES.get(key, fallback)


def _normalize_indicators(
    raw: Any, *, category_fallback: str, status_fallback: str
) -> List[Dict[str, str]]:
    indicators: List[Dict[str, str]] = []

    for item in raw or []:
        if not isinstance(item, dict):
            text = _clean_text(item)
            if not text:
                continue
            item = {"category": text, "status": "", "findings": ""}

        status = _clean_text(item.get("status"))
        badge = status_badge(status)

        # Legacy rows carry no risk_level, so derive a sensible default from the
        # badge instead of showing an empty field in the report.
        fallback_level = {
            COMPLIANT: "LOW",
            CONDITIONAL: "MODERATE",
            NON_COMPLIANT: "HIGH",
        }[badge]

        indicators.append(
            {
                "category": _clean_text(item.get("category")) or category_fallback,
                "status": status or status_fallback,
                "badge": badge,
                "risk_level": _normalize_risk_level(
                    item.get("risk_level"), fallback_level
                ),
                "findings": _clean_text(item.get("findings")),
                "evidence": _clean_text(item.get("evidence")),
            }
        )

    return indicators


def _normalize_recommendations(raw: Any) -> List[Dict[str, str]]:
    recommendations: List[Dict[str, str]] = []

    for item in raw or []:
        if isinstance(item, dict):
            text = _clean_text(item.get("recommendation") or item.get("text"))
            if not text:
                continue
            recommendations.append(
                {
                    "priority": _normalize_priority(item.get("priority")),
                    "recommendation": text,
                    "expected_impact": _clean_text(
                        item.get("expected_impact") or item.get("impact")
                    ),
                }
            )
            continue

        # Legacy rows stored recommendations as bare strings.
        text = _clean_text(item)
        if text:
            recommendations.append(
                {
                    "priority": "MEDIUM",
                    "recommendation": text,
                    "expected_impact": "",
                }
            )

    return recommendations


def _normalize_references(raw: Any) -> List[Dict[str, str]]:
    references: List[Dict[str, str]] = []

    for item in raw or []:
        if isinstance(item, dict):
            source = _clean_text(item.get("source") or item.get("citation"))
            text = _clean_text(item.get("text") or item.get("translation"))
            relevance = _clean_text(item.get("relevance") or item.get("note"))
        else:
            source = ""
            text = _clean_text(item)
            relevance = ""

        if not (source or text):
            continue

        references.append({"source": source, "text": text, "relevance": relevance})

    return references


def _derive_classification(score: int, loc: Localizer) -> str:
    """Fallback label for reports saved before ``classification`` existed.

    Derived here rather than in the renderer, so the label is written in the
    report's own language instead of defaulting to English.
    """
    if score <= 20:
        label = "Shariah Compliant"
    elif score <= 40:
        label = "Conditionally Compliant"
    elif score <= 70:
        label = "Requires Scholar Review"
    else:
        label = "Non-Compliant"
    return loc.classification(label)


def _derive_key_findings(indicators: List[Dict[str, str]]) -> List[str]:
    """Builds highlights from indicators when the model supplied none."""
    ranking = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "LOW": 3}
    ordered = sorted(
        (item for item in indicators if item["findings"]),
        key=lambda item: ranking.get(item["risk_level"], 2),
    )
    return [f"{item['category']}: {item['findings']}" for item in ordered[:5]]


def normalize_report(
    raw: Optional[Dict[str, Any]],
    *,
    report_id: Optional[str] = None,
    audit_type: Optional[str] = None,
    generated_at: Optional[datetime] = None,
    language: Optional[str] = None,
) -> Dict[str, Any]:
    """Returns a complete report dictionary with no missing keys.

    Explicit arguments win over values inside ``raw`` so callers can attach
    trusted server-side metadata (identifier, audit type, timestamp) to a
    payload that originated from the AI provider or from an old database row.

    ``language`` decides the language of the values this function *invents*
    (fallback classification, placeholder category and status). It defaults to
    the language recorded on the report, so a report never mixes languages.
    """
    source: Dict[str, Any] = dict(raw or {})
    loc = Localizer(
        language if language is not None else source.get("language")
    )

    score = clamp_score(source.get("overall_shariah_risk_score"))
    indicators = _normalize_indicators(
        source.get("shariah_indicators"),
        category_fallback=loc.text("fallback_category"),
        status_fallback=loc.text("fallback_status"),
    )
    key_findings = _string_list(source.get("key_findings")) or _derive_key_findings(
        indicators
    )

    resolved_generated_at = generated_at or datetime.now(timezone.utc)

    return {
        "report_id": _clean_text(report_id or source.get("report_id"))
        or generate_report_id(),
        "audit_type": _clean_text(audit_type or source.get("audit_type"))
        or "Shariah Compliance Audit",
        "generated_at": resolved_generated_at.isoformat(),
        "project_name": _clean_text(source.get("project_name")) or "Unnamed Project",
        "token_ticker": _clean_text(source.get("token_ticker")),
        "overall_shariah_risk_score": score,
        "risk_band": risk_band(score),
        "overall_verdict": _clean_text(source.get("overall_verdict")),
        "language": loc.language,
        "classification": _clean_text(source.get("classification"))
        or _derive_classification(score, loc),
        "confidence_level": clamp_confidence(source.get("confidence_level")),
        "executive_summary": _clean_text(source.get("executive_summary")),
        "key_findings": key_findings,
        "shariah_indicators": indicators,
        "tokenomics_risk_factors": _string_list(source.get("tokenomics_risk_factors")),
        "scholarly_disagreements": _string_list(source.get("scholarly_disagreements")),
        "actionable_recommendations": _normalize_recommendations(
            source.get("actionable_recommendations")
        ),
        "quran_hadith_references": _normalize_references(
            source.get("quran_hadith_references") or source.get("references")
        ),
        "input_mismatch_detected": bool(source.get("input_mismatch_detected")),
        "input_correction_notes": _clean_text(source.get("input_correction_notes")),
    }
