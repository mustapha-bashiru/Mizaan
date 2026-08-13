"""Tests for report normalization and PDF rendering.

These focus on the shapes that actually caused trouble in practice: reports
saved by older versions of the app, and reports where the AI omitted fields.
The PDF renderer must never raise on real stored data, because a render failure
would make an already-completed audit permanently undownloadable.
"""

import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from report_pdf import build_audit_pdf  # noqa: E402
from report_schema import (  # noqa: E402
    NO_REFERENCES_TEXT,
    clamp_confidence,
    clamp_score,
    generate_report_id,
    normalize_report,
    risk_band,
    status_badge,
)

PDF_MAGIC = b"%PDF"


# ---------------------------------------------------------------------------
# Scores and bands
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "raw,expected",
    [(0, 0), (55, 55), (100, 100), (-10, 0), (140, 100), ("42", 42), (None, 0),
     ("not a number", 0), (37.6, 38)],
)
def test_clamp_score_keeps_values_in_range(raw, expected):
    assert clamp_score(raw) == expected


@pytest.mark.parametrize(
    "score,key",
    [(0, "LOW"), (20, "LOW"), (21, "MODERATE"), (40, "MODERATE"),
     (41, "ELEVATED"), (70, "ELEVATED"), (71, "HIGH"), (100, "HIGH")],
)
def test_risk_band_boundaries_match_the_spec(score, key):
    assert risk_band(score)["key"] == key


def test_clamp_confidence_accepts_fractions_and_percentages():
    assert clamp_confidence(0.85) == 0.85
    assert clamp_confidence(85) == 0.85
    assert clamp_confidence(None) is None
    assert clamp_confidence("bad") is None
    assert clamp_confidence(-1) == 0.0


# ---------------------------------------------------------------------------
# Status badges
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "status,expected",
    [
        ("PASS", "COMPLIANT"),
        ("Compliant", "COMPLIANT"),
        ("FAIL", "NON_COMPLIANT"),
        ("Non-Compliant", "NON_COMPLIANT"),
        ("WARNING", "CONDITIONAL"),
        ("REQUIRES_SCHOLAR_REVIEW", "CONDITIONAL"),
        ("", "CONDITIONAL"),
        (None, "CONDITIONAL"),
    ],
)
def test_status_badge_classification(status, expected):
    assert status_badge(status) == expected


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------
def test_normalize_fills_every_key_for_an_empty_report():
    report = normalize_report({})

    # The renderer indexes these directly, so absence would be a crash.
    for key in (
        "report_id", "audit_type", "project_name", "overall_shariah_risk_score",
        "risk_band", "classification", "key_findings", "shariah_indicators",
        "actionable_recommendations", "quran_hadith_references",
    ):
        assert key in report

    assert report["project_name"] == "Unnamed Project"
    assert report["report_id"].startswith("MZN-")


def test_legacy_string_recommendations_become_structured_cards():
    report = normalize_report(
        {"actionable_recommendations": ["Remove the lending pool.", "Publish audit."]}
    )

    recommendations = report["actionable_recommendations"]
    assert len(recommendations) == 2
    assert recommendations[0]["recommendation"] == "Remove the lending pool."
    assert recommendations[0]["priority"] == "MEDIUM"
    assert recommendations[0]["expected_impact"] == ""


def test_indicator_risk_level_is_derived_when_missing():
    report = normalize_report(
        {
            "shariah_indicators": [
                {"category": "Riba", "status": "FAIL", "findings": "Interest."},
                {"category": "Utility", "status": "PASS", "findings": "Clean."},
            ]
        }
    )

    riba, utility = report["shariah_indicators"]
    assert riba["badge"] == "NON_COMPLIANT"
    assert riba["risk_level"] == "HIGH"
    assert utility["badge"] == "COMPLIANT"
    assert utility["risk_level"] == "LOW"


def test_classification_is_derived_from_score_when_absent():
    assert normalize_report({"overall_shariah_risk_score": 10})[
        "classification"] == "Shariah Compliant"
    assert normalize_report({"overall_shariah_risk_score": 90})[
        "classification"] == "Non-Compliant"


def test_key_findings_fall_back_to_indicator_summaries():
    report = normalize_report(
        {
            "shariah_indicators": [
                {"category": "Riba", "status": "FAIL", "findings": "Interest bearing."}
            ]
        }
    )
    assert report["key_findings"] == ["Riba: Interest bearing."]


def test_supplied_metadata_overrides_model_supplied_values():
    # A model must not be able to choose its own report identifier.
    report = normalize_report(
        {"report_id": "ATTACKER-CONTROLLED"},
        report_id="MZN-REAL-001",
        audit_type="Crypto Protocol Audit",
    )
    assert report["report_id"] == "MZN-REAL-001"
    assert report["audit_type"] == "Crypto Protocol Audit"


def test_report_ids_are_unique():
    assert len({generate_report_id() for _ in range(200)}) == 200


# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------
def test_pdf_renders_for_a_complete_report():
    report = {
        "project_name": "Uniswap",
        "token_ticker": "UNI",
        "overall_shariah_risk_score": 45,
        "overall_verdict": "Conditionally acceptable with restrictions.",
        "classification": "Conditionally Compliant",
        "confidence_level": 0.86,
        "executive_summary": "A detailed summary. " * 40,
        "key_findings": ["Finding one.", "Finding two."],
        "shariah_indicators": [
            {
                "category": "Riba",
                "status": "WARNING",
                "risk_level": "HIGH",
                "findings": "Detail. " * 60,
                "evidence": "Whitepaper p.12",
            }
        ],
        "actionable_recommendations": [
            {
                "priority": "HIGH",
                "recommendation": "Segregate interest income.",
                "expected_impact": "Removes the primary riba exposure.",
            }
        ],
        "quran_hadith_references": [
            {
                "source": "Qur'an 2:275",
                "text": "Allah has permitted trade and forbidden interest.",
                "relevance": "Directly addresses the lending mechanism.",
            }
        ],
    }

    pdf = build_audit_pdf(report, audit_type="Crypto Protocol Audit")
    assert pdf.startswith(PDF_MAGIC)
    assert len(pdf) > 5000


def test_pdf_renders_for_legacy_and_empty_reports():
    legacy = {
        "project_name": "A Legacy Project With An Extremely Long Name " * 3,
        "overall_shariah_risk_score": 82,
        "shariah_indicators": [
            {"category": "Riba", "status": "FAIL", "findings": "Interest pool."}
        ],
        "actionable_recommendations": ["Remove the pool.", "Publish an audit."],
    }

    for payload in (legacy, {}, None):
        pdf = build_audit_pdf(payload)
        assert pdf.startswith(PDF_MAGIC)


def test_pdf_escapes_markup_in_model_output():
    # Model text lands inside ReportLab's mini-HTML parser; unescaped tags
    # would either corrupt the layout or raise during rendering.
    payload = {
        "project_name": "<b>Injected</b>",
        "executive_summary": "5 < 6 & 7 > 2 <para>not a tag</para>",
        "shariah_indicators": [
            {"category": "<i>x</i>", "status": "PASS", "findings": "<br/>"}
        ],
    }
    assert build_audit_pdf(payload).startswith(PDF_MAGIC)


def test_missing_references_render_the_documented_placeholder():
    assert normalize_report({})["quran_hadith_references"] == []
    assert NO_REFERENCES_TEXT == "No relevant primary references identified."


def test_pdf_keeps_the_full_multi_page_audit_layout():
    """Pins the document shape: cover page, every section, running metadata.

    A regression once collapsed this into a single-page, order-form style
    summary that silently dropped sections and truncated long model output.
    Asserting on extracted text keeps that from coming back unnoticed.
    """
    pypdf = pytest.importorskip("pypdf")

    report = {
        "project_name": "Long Content Protocol",
        "token_ticker": "LONG",
        "overall_shariah_risk_score": 85,
        "confidence_level": 0.85,
        "executive_summary": "Summary sentence. " * 120,
        "key_findings": [f"Finding {i}. " + "detail " * 30 for i in range(5)],
        "shariah_indicators": [
            {
                "category": f"Indicator {i}",
                "status": "NON_COMPLIANT",
                "risk_level": "HIGH",
                "findings": "Finding detail. " * 40,
                "evidence": "Evidence text. " * 10,
            }
            for i in range(6)
        ],
        "tokenomics_risk_factors": [
            f"Risk factor {i}. " + "detail " * 30 for i in range(6)
        ],
        "scholarly_disagreements": [
            f"Perspective {i}. " + "detail " * 30 for i in range(5)
        ],
        "actionable_recommendations": [
            {
                "priority": "HIGH",
                "recommendation": f"Recommendation {i}. " + "text " * 30,
                "expected_impact": "Impact " * 20,
            }
            for i in range(6)
        ],
        "quran_hadith_references": [
            {
                "source": "Qur'an 5:90",
                "text": "Reference text " * 15,
                "relevance": "Relevance " * 15,
            }
            for i in range(4)
        ],
    }

    pdf = build_audit_pdf(
        report, report_id="MZN-TEST-0001", audit_type="Crypto Protocol Audit"
    )
    reader = pypdf.PdfReader(io.BytesIO(pdf))
    text = "\n".join(page.extract_text() for page in reader.pages)

    # The cover page plus flowed body content: never a single page.
    assert len(reader.pages) > 3

    for heading in (
        "AUDIT REPORT",
        "Executive Summary",
        "Risk Score",
        "Key Findings",
        "Compliance Findings",
        "Risk Factors",
        "Scholarly Perspectives",
        "Actionable Recommendations",
        "IMPORTANT NOTICE",
    ):
        assert heading in text, f"missing section: {heading}"

    # Running header/footer metadata on the body pages.
    assert "SHARIAH COMPLIANCE AUDIT" in text
    assert "MZN-TEST-0001" in text
    assert "Page 2 of" in text

    # Long lists flow onto later pages instead of being cut at a page break.
    assert "Indicator 5" in text
    assert "Recommendation 5" in text
    assert "Reference text" in text
