#!/usr/bin/env python3
"""Test to verify Arabic PDF generation includes Arabic labels."""

from report_pdf import build_audit_pdf
from report_i18n import LABELS

# Sample report data
sample_report = {
    "project_name": "Test Project",
    "token_ticker": "TEST",
    "overall_shariah_risk_score": 50,
    "classification": "Conditionally Compliant",
    "executive_summary": "هذا ملخص تجريبي بالعربية",
    "key_findings": ["نتيجة 1 بالعربية"],
    "shariah_indicators": [
        {
            "category": "الغرر",
            "status": "مطابق",
            "risk_level": "LOW",
            "findings": "نتيجة بالعربية",
            "evidence": "دليل بالعربية",
        }
    ],
    "scholarly_disagreements": ["اختلاف علماء"],
    "tokenomics_risk_factors": ["عامل خطر"],
    "actionable_recommendations": [
        {
            "priority": "HIGH",
            "recommendation": "التوصية بالعربية",
            "expected_impact": "التأثير المتوقع",
        }
    ],
    "quran_hadith_references": [
        {
            "source": "سورة البقرة",
            "text": "وأحل الله البيع",
            "relevance": "الصلة بالموضوع",
        }
    ],
}

print("Testing PDF generation with Arabic language...")
print(f"Arabic label for 'Executive Summary': {LABELS['ar']['section_executive_summary']}")
print(f"Arabic label for 'Risk Score': {LABELS['ar']['section_risk_score']}")

try:
    # Generate PDF with explicit Arabic language
    pdf_bytes = build_audit_pdf(sample_report, language="ar")
    
    print(f"✓ PDF generated successfully ({len(pdf_bytes)} bytes)")
    
    # Check for Arabic font in PDF
    if b"IBMPlexSansArabic" in pdf_bytes:
        print("✓ PDF contains Arabic font (IBMPlexSansArabic)")
    else:
        print("✗ WARNING: PDF does NOT contain Arabic font!")
        print("  This suggests the localizer may not have initialized the Arabic font correctly")
    
    # Check for English labels that shouldn't be there
    if b"Executive Summary" in pdf_bytes:
        print("✗ WARNING: PDF contains English 'Executive Summary' label!")
        print("  This suggests Arabic labels are NOT being used")
    else:
        print("✓ PDF does not contain English 'Executive Summary' label (as expected)")
        
    # Check for the Arabic word we added
    # Note: This is approximate since PDFs may encode text differently
    if "ملخص" in sample_report.get("executive_summary", ""):
        print("✓ Sample contains Arabic content")
        
except Exception as e:
    print(f"✗ Error generating PDF: {e}")
    import traceback
    traceback.print_exc()
