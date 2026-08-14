#!/usr/bin/env python3
"""Check what's actually stored in the database for recent audits."""

import json
from pathlib import Path
from database import SessionLocal, get_db
from models import AuditHistory

db = SessionLocal()

print("Checking recent audits in the database:\n")
print(f"{'Report ID':<30} {'Language':<12} {'Project':<20} {'PDF Filename'}")
print("-" * 85)

# Get the 10 most recent audits
recent = db.query(AuditHistory).order_by(AuditHistory.created_at.desc()).limit(10).all()

for audit in recent:
    try:
        report_data = json.loads(audit.report_json or '{}')
        language = report_data.get('language', 'MISSING')
        project = audit.project_or_platform_name[:20]
        report_id = audit.report_id or "NO ID"
        pdf_file = audit.pdf_filename or "NO FILE"
        
        print(f"{report_id:<30} {language:<12} {project:<20} {pdf_file}")
    except Exception as e:
        print(f"ERROR reading audit {audit.id}: {e}")

db.close()
