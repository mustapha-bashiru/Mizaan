#!/usr/bin/env python3
"""Debug script to trace language parameter through the audit flow."""

import json
from pathlib import Path
from report_i18n import normalize_language
from report_schema import normalize_report

# Simulate what happens when language='ar' comes from frontend
print("=" * 60)
print("SIMULATING AUDIT CREATION FLOW")
print("=" * 60)

# Step 1: Frontend sends language='ar'
language_from_frontend = 'ar'
print(f"\n1. Frontend sends: language='{language_from_frontend}'")

# Step 2: Backend receives and normalizes
report_language = normalize_language(language_from_frontend)
print(f"2. Backend normalizes: normalize_language('{language_from_frontend}') = '{report_language}'")

# Step 3: AI returns a report (without language field)
ai_report = {
    "project_name": "Uniswap",
    "token_ticker": "UNI",
    "overall_shariah_risk_score": 50,
    "classification": "Conditionally Compliant",
    "executive_summary": "هذا ملخص تنفيذي بالعربية",
}
print(f"\n3. AI returns report (language field: {ai_report.get('language', 'MISSING')})")

# Step 4: Backend enriches the report
enriched = dict(ai_report)
enriched["language"] = report_language
enriched["report_id"] = "MZN-20260814-84AO11"
print(f"\n4. Backend enriches report:")
print(f"   - Sets enriched['language'] = '{report_language}'")
print(f"   - enriched now has language field: {enriched.get('language')}")

# Step 5: Report is serialized to JSON and stored
report_json = json.dumps(enriched)
print(f"\n5. Report serialized to JSON:")
print(f"   - JSON contains 'language': '{enriched.get('language')}'")

# Step 6: Simulate retrieval from database
stored = json.loads(report_json)
print(f"\n6. Retrieved from database:")
print(f"   - stored.get('language') = '{stored.get('language')}'")

# Step 7: PDF build is called
print(f"\n7. PDF generation called with:")
print(f"   - language=report_language where report_language='{report_language}'")
print(f"   - OR language=stored.get('language') where stored.get('language')='{stored.get('language')}'")

# Step 8: What happens in build_audit_pdf
print(f"\n8. Inside build_audit_pdf():")
print(f"   language parameter passed: YES ({report_language})")
print(f"   use_language(language if language is not None else source.get('language'))")
print(f"   → use_language('{report_language}' if {report_language is not None} else '{stored.get('language')}')")
print(f"   → use_language('{report_language}')")

print("\n" + "=" * 60)
print("CHECKING IF THERE'S A MISMATCH IN THE ACTUAL STORED DATA")
print("=" * 60)

# Let's check what's in one of the actual stored PDFs
storage_path = Path("report_storage/MZN-20260814-84AO11-Uniswap.pdf")
if storage_path.exists():
    print(f"\nFound actual PDF: {storage_path}")
    pdf_content = storage_path.read_bytes()
    if b"IBMPlexSansArabic" in pdf_content:
        print("✓ PDF contains Arabic font - language WAS passed correctly")
    else:
        print("✗ PDF contains Helvetica only - language was NOT passed (or not passed initially)")
        
    if b"Executive Summary" in pdf_content:
        print("✗ PDF contains 'Executive Summary' (English) - should be Arabic")
    else:
        print("✓ PDF does not contain 'Executive Summary'")
else:
    print(f"PDF not found at {storage_path}")
    print("Checking what files exist...")
    storage_dir = Path("report_storage")
    pdf_files = sorted(storage_dir.glob("*.pdf"))
    print(f"Found {len(pdf_files)} PDF files")
    if pdf_files:
        print(f"Most recent: {pdf_files[-1].name}")
