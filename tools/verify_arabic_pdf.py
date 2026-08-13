"""Renders a report in every supported language and checks the text survives.

The Arabic bug this guards against was silent: the PDF built without error and
only *looked* wrong, because missing glyphs are drawn as empty boxes rather
than raising. So the check here is not "did it build" but "can the Arabic text
be read back out of the finished file".

Run with:  python tools/verify_arabic_pdf.py
"""

from __future__ import annotations

import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pypdf import PdfReader  # noqa: E402

from report_i18n import LABELS, SUPPORTED_LANGUAGES, Localizer  # noqa: E402
from report_pdf import build_audit_pdf  # noqa: E402

# Checked in every language: these are strings the *renderer* contributes, so
# finding them proves the localized furniture reached the page rather than the
# model's own prose.
PROBE_KEYS = (
    "section_executive_summary",
    "section_risk_score",
    "section_recommendations",
    "section_references",
    "label_overall_verdict",
)

SAMPLE = {
    "project_name": "Shiba Inu",
    "token_ticker": "SHIB",
    "overall_shariah_risk_score": 78,
    "classification": "Non-Compliant",
    "confidence_level": 0.86,
    "executive_summary": (
        "التقييم يشير إلى أن هذا المشروع ينطوي على درجة عالية من الغرر والمضاربة، "
        "ولا توجد أصول حقيقية تدعم قيمة العملة."
    ),
    "key_findings": [
        "لا يوجد أصل حقيقي يدعم العملة، والقيمة تعتمد على المضاربة فقط.",
        "نسبة كبيرة من العرض مملوكة لعدد محدود من المحافظ.",
    ],
    "shariah_indicators": [
        {
            "category": "الغرر (عدم اليقين)",
            "status": "غير متوافق",
            "risk_level": "HIGH",
            "findings": "المشروع يعتمد كلياً على تقلبات السوق دون قيمة جوهرية.",
            "evidence": "لا توجد إيرادات أو أصول معلنة في الوثائق الرسمية.",
        },
    ],
    "tokenomics_risk_factors": ["تركّز الملكية في عدد قليل من المحافظ."],
    "scholarly_disagreements": ["يرى بعض العلماء جواز التداول بشروط صارمة."],
    "actionable_recommendations": [
        {
            "priority": "HIGH",
            "recommendation": "الامتناع عن الاستثمار حتى توفر أصول حقيقية داعمة.",
            "expected_impact": "تقليل التعرض للمخاطر غير الشرعية بشكل جوهري.",
        },
    ],
    "quran_hadith_references": [
        {
            "source": "سورة البقرة ٢٧٥",
            "text": "وَأَحَلَّ اللَّهُ الْبَيْعَ وَحَرَّمَ الرِّبَا",
            "relevance": "الأصل في البيع الحل ما لم يشتمل على ربا أو غرر.",
        },
    ],
}


def _has_arabic(text: str) -> bool:
    return any("\u0600" <= ch <= "\u06FF" or "\uFB50" <= ch <= "\uFEFF" for ch in text)


def _contains(haystack: str, needle: str) -> bool:
    """Substring test that tolerates visual-order extraction.

    Text drawn after bidi reordering can be extracted either way round
    depending on the viewer, and neither is a rendering fault, so both
    orientations count as a match.
    """
    return needle in haystack or needle[::-1] in haystack


def _check(language: str) -> bool:
    pdf = build_audit_pdf(SAMPLE, language=language)
    path = Path(f"arabic-check-{language}.pdf")
    path.write_bytes(pdf)

    reader = PdfReader(path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)

    # Presentation forms are what shaping produces; normalising back to the
    # base letters lets the original wording be compared directly.
    normalized = unicodedata.normalize("NFKC", text)

    print(f"\n=== {language} ===")
    print(f"pages: {len(reader.pages)}  extracted chars: {len(text)}")

    ok = True
    loc = Localizer(language)

    if language == "ar":
        if not _has_arabic(text):
            print("FAIL: no Arabic codepoints in the extracted text")
            ok = False
        else:
            print("ok: Arabic glyphs present")

        # A report that silently fell back to English would still contain
        # Arabic body text from the model, so check no English furniture leaked.
        for key in PROBE_KEYS:
            english = LABELS["en"][key]
            if _contains(normalized, english):
                print(f"FAIL: untranslated English label {english!r} on the page")
                ok = False

    for key in PROBE_KEYS:
        expected = unicodedata.normalize("NFKC", loc.text(key))
        if _contains(normalized, expected):
            print(f"ok: found {key}")
        else:
            print(f"FAIL: {key} ({expected!r}) missing from extracted text")
            ok = False

    if "\ufffd" in text or "\x00" in text:
        print("FAIL: replacement/null characters found")
        ok = False

    print(f"saved: {path}")
    return ok


def main() -> int:
    results = {lang: _check(lang) for lang in SUPPORTED_LANGUAGES}
    print("\n--- summary ---")
    for language, ok in results.items():
        print(f"{language}: {'PASS' if ok else 'FAIL'}")
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
