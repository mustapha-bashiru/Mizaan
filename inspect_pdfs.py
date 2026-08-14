#!/usr/bin/env python3
"""Inspect actual PDFs to check what language/font they were rendered with."""

from pathlib import Path

storage_dir = Path("report_storage")
pdf_files = sorted(storage_dir.glob("MZN-*.pdf"))

print("Checking actual PDFs for language/font information:\n")
print(f"{'Filename':<50} {'Arabic Font?':<15} {'Has English?':<15}")
print("-" * 80)

for pdf_file in pdf_files[-10:]:  # Check last 10 PDFs
    try:
        content = pdf_file.read_bytes()
        has_arabic_font = b"IBMPlexSansArabic" in content
        has_english = b"Executive Summary" in content or b"Risk Score" in content
        
        status_font = "✓ YES" if has_arabic_font else "✗ NO"
        status_english = "✓ YES" if has_english else "✗ NO"
        
        print(f"{pdf_file.name:<50} {status_font:<15} {status_english:<15}")
    except Exception as e:
        print(f"{pdf_file.name:<50} ERROR: {e}")

print("\nInterpretation:")
print("  ✓ YES (Arabic Font) = PDF was rendered with language='ar'")
print("  ✗ NO (Arabic Font) = PDF was rendered with language='en' (default)")
print("  ✓ YES (English) = PDF contains English labels (should be Arabic for ar)")
print("  ✗ NO (English) = PDF does not contain English labels (correct for ar)")
