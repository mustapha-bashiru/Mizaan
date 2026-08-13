"""Regression tests for report localization, especially Arabic.

The original defect produced a PDF full of empty boxes: ReportLab's default
Helvetica has no Arabic glyphs, and Arabic additionally needs contextual
shaping and bidirectional reordering that ReportLab does not perform. None of
that raises an exception, so these tests assert on the *content of the
rendered file* rather than on the render merely succeeding.
"""

from __future__ import annotations

import unicodedata

import pytest

from report_i18n import (
    DEFAULT_LANGUAGE,
    LABELS,
    SUPPORTED_LANGUAGES,
    Localizer,
    contains_rtl,
    normalize_language,
    register_rtl_fonts,
    shape_rtl,
    wrap_rtl_lines,
)
from report_pdf import build_audit_pdf
from report_schema import normalize_report

ARABIC_SENTENCE = "لا يوجد أصل حقيقي يدعم العملة، والقيمة تعتمد على المضاربة فقط."

SAMPLE = {
    "project_name": "Shiba Inu",
    "overall_shariah_risk_score": 78,
    "classification": "Non-Compliant",
    "executive_summary": ARABIC_SENTENCE,
    "key_findings": [ARABIC_SENTENCE],
    "shariah_indicators": [
        {
            "category": "الغرر",
            "status": "غير متوافق",
            "risk_level": "HIGH",
            "findings": ARABIC_SENTENCE,
            "evidence": "لا توجد إيرادات معلنة.",
        }
    ],
    "actionable_recommendations": [
        {
            "priority": "HIGH",
            "recommendation": "الامتناع عن الاستثمار.",
            "expected_impact": "تقليل التعرض للمخاطر.",
        }
    ],
    "quran_hadith_references": [
        {"source": "سورة البقرة", "text": "وأحل الله البيع وحرم الربا", "relevance": "الأصل في البيع الحل."}
    ],
}


def _extract(pdf_bytes: bytes) -> str:
    reader = pytest.importorskip("pypdf").PdfReader
    import io

    document = reader(io.BytesIO(pdf_bytes))
    text = "\n".join(page.extract_text() or "" for page in document.pages)
    return unicodedata.normalize("NFKC", text)


def _contains(haystack: str, needle: str) -> bool:
    # Bidi text may be extracted in either direction depending on the reader;
    # both are correct renderings, so accept either orientation.
    return needle in haystack or needle[::-1] in haystack


# ---------------------------------------------------------------------------
# Language resolution
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "value,expected",
    [
        ("ar", "ar"),
        ("AR", "ar"),
        ("ar-SA", "ar"),
        ("ar_EG", "ar"),
        ("fr", "fr"),
        ("en", "en"),
        # Anything unsupported degrades to English rather than rendering blanks.
        ("de", "en"),
        ("", "en"),
        (None, "en"),
    ],
)
def test_normalize_language(value, expected):
    assert normalize_language(value) == expected


def test_arabic_localizer_uses_an_arabic_capable_font():
    loc = Localizer("ar")
    assert loc.is_rtl is True
    # The bug was Helvetica being used for Arabic; it has no Arabic glyphs.
    assert loc.font != "Helvetica"
    assert loc.font_bold != "Helvetica-Bold"


def test_latin_localizer_keeps_helvetica():
    loc = Localizer("en")
    assert loc.is_rtl is False
    assert loc.font == "Helvetica"


def test_bundled_arabic_fonts_are_present():
    assert register_rtl_fonts() is True, "Arabic font files are missing from assets/"


# ---------------------------------------------------------------------------
# Catalog completeness
# ---------------------------------------------------------------------------
def test_every_language_defines_every_label():
    expected = set(LABELS[DEFAULT_LANGUAGE])
    for language in SUPPORTED_LANGUAGES:
        missing = expected - set(LABELS[language])
        assert not missing, f"{language} is missing labels: {sorted(missing)}"


def test_no_language_leaves_a_label_empty():
    for language in SUPPORTED_LANGUAGES:
        for key, value in LABELS[language].items():
            assert value.strip(), f"{language}.{key} is empty"


# ---------------------------------------------------------------------------
# Shaping / wrapping
# ---------------------------------------------------------------------------
def test_shaping_changes_arabic_and_leaves_latin_alone():
    assert shape_rtl("Hello") == "Hello"
    shaped = shape_rtl(ARABIC_SENTENCE)
    assert shaped != ARABIC_SENTENCE
    assert contains_rtl(shaped)


def test_wrap_rtl_lines_respects_the_given_width():
    from reportlab.pdfbase.pdfmetrics import stringWidth

    loc = Localizer("ar")
    width = 160
    lines = wrap_rtl_lines(ARABIC_SENTENCE * 3, loc.font, 9.5, width)

    assert len(lines) > 1, "long Arabic text should wrap onto several lines"
    for line in lines:
        # A small tolerance: a single unbreakable word may exceed the limit.
        assert stringWidth(line, loc.font, 9.5) <= width * 1.35


def test_wrap_rtl_lines_handles_empty_input():
    assert wrap_rtl_lines("", "Helvetica", 10, 100) == []
    assert wrap_rtl_lines(None, "Helvetica", 10, 100) == []


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
def test_schema_fallbacks_follow_the_report_language():
    report = normalize_report(
        {"overall_shariah_risk_score": 90, "shariah_indicators": [{"findings": "x"}]},
        language="ar",
    )

    assert report["language"] == "ar"
    assert contains_rtl(report["classification"])
    assert contains_rtl(report["shariah_indicators"][0]["category"])
    assert contains_rtl(report["shariah_indicators"][0]["status"])


def test_schema_defaults_to_the_language_stored_on_the_report():
    report = normalize_report({"language": "fr", "overall_shariah_risk_score": 10})
    assert report["classification"] == "Conforme à la Charia"


def test_english_reports_are_unchanged():
    report = normalize_report({"overall_shariah_risk_score": 10})
    assert report["classification"] == "Shariah Compliant"
    assert report["language"] == "en"


# ---------------------------------------------------------------------------
# End-to-end rendering
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("language", SUPPORTED_LANGUAGES)
def test_report_renders_in_every_language(language):
    pdf = build_audit_pdf(SAMPLE, language=language)
    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 5000


def test_arabic_pdf_contains_readable_arabic_text():
    pdf = build_audit_pdf(SAMPLE, language="ar")
    text = _extract(pdf)

    assert contains_rtl(text), "no Arabic glyphs were embedded in the PDF"

    loc = Localizer("ar")
    for key in ("section_executive_summary", "section_recommendations"):
        expected = unicodedata.normalize("NFKC", loc.text(key))
        assert _contains(text, expected), f"{key} missing from the rendered PDF"


def test_arabic_pdf_has_no_english_furniture_left():
    text = _extract(build_audit_pdf(SAMPLE, language="ar"))
    for key in ("section_executive_summary", "section_references", "cover_kicker"):
        assert not _contains(text, LABELS["en"][key]), (
            f"English label for {key} leaked into the Arabic report"
        )


def test_language_is_taken_from_the_report_when_not_passed():
    """A stored report re-renders in the language it was created in."""
    text = _extract(build_audit_pdf({**SAMPLE, "language": "ar"}))
    assert contains_rtl(text)


def test_unknown_language_falls_back_to_english_rather_than_failing():
    text = _extract(build_audit_pdf(SAMPLE, language="klingon"))
    assert _contains(text, LABELS["en"]["section_executive_summary"])
