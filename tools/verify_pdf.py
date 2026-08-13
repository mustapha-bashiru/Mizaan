"""Offline PDF render check.

Renders the bundled sample report through the production PDF pipeline so the
layout and brand mark can be inspected without an API key, a database, or a
running server.

Run from the repository root:

    python tools/verify_pdf.py

Output is written to ``report_storage/`` (git-ignored) unless --out is given.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from pypdf import PdfReader  # noqa: E402

from report_pdf import build_audit_pdf  # noqa: E402
from report_schema import generate_report_id  # noqa: E402

DEFAULT_SAMPLE = REPO_ROOT / "sample_reports" / "uniswap_sample.json"
DEFAULT_OUT = REPO_ROOT / "report_storage" / "verify_sample_report.pdf"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sample",
        type=Path,
        default=DEFAULT_SAMPLE,
        help=f"Report JSON to render (default: {DEFAULT_SAMPLE.name})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Destination PDF path",
    )
    args = parser.parse_args()

    if not args.sample.is_file():
        print(f"Sample report not found: {args.sample}", file=sys.stderr)
        return 1

    report = json.loads(args.sample.read_text(encoding="utf-8"))

    pdf_bytes = build_audit_pdf(
        report,
        report_id=generate_report_id(),
        audit_type=report.get("audit_type", "Crypto Protocol"),
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(pdf_bytes)

    reader = PdfReader(args.out)
    meta = reader.metadata

    print(f"Rendered  : {args.out}")
    print(f"Size      : {len(pdf_bytes):,} bytes")
    print(f"Pages     : {len(reader.pages)}")
    print(f"Title     : {meta.title if meta else '-'}")
    print(f"Author    : {meta.author if meta else '-'}")
    print(f"Creator   : {meta.creator if meta else '-'}")
    print("\nOpen the file to confirm the brand mark renders correctly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
