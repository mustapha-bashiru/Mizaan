#!/usr/bin/env python3
"""Quick test to verify language field is stored correctly in report JSON."""

import json
from report_i18n import normalize_language

# Simulate what happens in save_audit
language = 'ar'
report_language = normalize_language(language)
print(f'Input language: {language}')
print(f'Normalized language: {report_language}')

# Simulate enriching the report
enriched = {'project_name': 'Test', 'overall_shariah_risk_score': 50}
enriched['language'] = report_language
print(f'Enriched report: {enriched}')

# Simulate JSON serialization (what gets stored in DB)
report_json = json.dumps(enriched)
print(f'JSON string: {report_json}')

# Simulate retrieval from DB
retrieved = json.loads(report_json)
print(f'Retrieved language field: {retrieved.get("language")}')
print(f'Is it "ar"? {retrieved.get("language") == "ar"}')

# Test what happens in build_audit_pdf when language is None
from report_pdf import build_audit_pdf
print('\n--- Testing PDF generation ---')
print(f'If language passed: language="ar"')
print(f'If language from report: source.get("language") = {retrieved.get("language")}')
