"""Enterprise-grade PDF rendering for Mizaan audit reports.

Design notes
------------
The report is built with ReportLab's Platypus flowables rather than absolute
canvas coordinates. That matters because audit content is variable-length: a
finding may be two lines or twenty, and hand-placed coordinates inevitably
overflow the page. Platypus reflows automatically, so no section can collide
with the next one or run off the sheet.

Page furniture (logo, header rule, footer, page numbers) is drawn by
``_ReportCanvas``, which buffers the document and stamps "Page X of Y" once the
total page count is known.

The Mizaan mark is drawn with native vector primitives instead of embedding the
SVG file. This keeps the PDF free of raster artefacts, avoids an SVG
rasterisation dependency, and means the report renders identically on a server
with no browser or font-rasteriser available.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)

from config import settings
from report_i18n import (
    Localizer,
    current_localizer,
    escape_xml,
    reset_language,
    use_language,
)
from report_schema import normalize_report

# ---------------------------------------------------------------------------
# Brand tokens
# ---------------------------------------------------------------------------
BRAND_DEEP = colors.HexColor("#064E3B")
BRAND_PRIMARY = colors.HexColor("#0F766E")
BRAND_ACCENT = colors.HexColor("#10B981")
BRAND_GOLD = colors.HexColor("#D97706")
# Pivot node inside the logo tile. Lighter than BRAND_GOLD so it stays legible
# against the green rather than muddying into it.
BRAND_NODE = colors.HexColor("#FBBF24")

INK = colors.HexColor("#0F172A")
INK_MUTED = colors.HexColor("#475569")
INK_SOFT = colors.HexColor("#94A3B8")
HAIRLINE = colors.HexColor("#E2E8F0")
SURFACE = colors.HexColor("#F8FAFC")

RISK_GREEN = colors.HexColor("#16A34A")
RISK_YELLOW = colors.HexColor("#CA8A04")
RISK_ORANGE = colors.HexColor("#EA580C")
RISK_RED = colors.HexColor("#DC2626")

STATUS_COLORS = {
    "COMPLIANT": (RISK_GREEN, colors.HexColor("#ECFDF5")),
    "CONDITIONAL": (RISK_YELLOW, colors.HexColor("#FEFCE8")),
    "NON_COMPLIANT": (RISK_RED, colors.HexColor("#FEF2F2")),
}

PRIORITY_COLORS = {
    "HIGH": RISK_RED,
    "MEDIUM": RISK_ORANGE,
    "LOW": RISK_GREEN,
}

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 20 * mm
MARGIN_TOP = 26 * mm
MARGIN_BOTTOM = 22 * mm
CONTENT_WIDTH = PAGE_WIDTH - (2 * MARGIN_X)

def _loc() -> Localizer:
    """The localizer for the report currently being rendered.

    Fonts, label text and text direction all vary per report, so they are
    resolved at draw time rather than baked into module constants.
    """
    return current_localizer()


def risk_color(score: int) -> colors.Color:
    """Colour bands required by the report specification."""
    if score <= 20:
        return RISK_GREEN
    if score <= 40:
        return RISK_YELLOW
    if score <= 70:
        return RISK_ORANGE
    return RISK_RED


# ---------------------------------------------------------------------------
# Paragraph styles
# ---------------------------------------------------------------------------
def _build_styles(loc: Localizer) -> Dict[str, ParagraphStyle]:
    """Paragraph styles bound to one language's fonts and text direction."""

    def style(name: str, **kwargs) -> ParagraphStyle:
        base = {
            "fontName": loc.font,
            "fontSize": 9.5,
            "leading": 15,
            "textColor": INK_MUTED,
            "alignment": loc.alignment,
            # RtlParagraph pre-breaks its own lines, so word/character
            # splitting inside ReportLab must not fight that decision.
            "wordWrap": "RTL" if loc.is_rtl else None,
        }
        base.update(kwargs)
        return ParagraphStyle(f"{name}_{loc.language}", **base)

    # Justification stretches pre-shaped RTL lines, so RTL bodies stay flush
    # to the right margin instead.
    body_alignment = TA_RIGHT if loc.is_rtl else TA_JUSTIFY

    return {
        "section": style(
            "section", fontName=loc.font_bold, fontSize=13, leading=17, textColor=INK
        ),
        "body": style("body", alignment=body_alignment),
        "card_title": style(
            "card_title", fontName=loc.font_bold, fontSize=10.5, leading=14,
            textColor=INK,
        ),
        "card_body": style("card_body", fontSize=9, leading=13.5),
        "label": style(
            "label", fontName=loc.font_bold, fontSize=7, leading=10,
            textColor=INK_SOFT,
        ),
        "metric": style(
            "metric", fontName=loc.font_bold, fontSize=15, leading=19, textColor=INK
        ),
        "quote": style(
            "quote", fontName=loc.font_italic, fontSize=9.5, leading=15, textColor=INK
        ),
        "cover_meta": style(
            "cover_meta", fontSize=9.5, leading=14, textColor=colors.white
        ),
        "notice": style(
            "notice", fontSize=7.5, leading=11, textColor=INK_SOFT,
            alignment=TA_CENTER,
        ),
        "empty": style(
            "empty", fontName=loc.font_italic, fontSize=9.5, textColor=INK_SOFT
        ),
    }


_STYLE_CACHE: Dict[str, Dict[str, ParagraphStyle]] = {}


def _styles() -> Dict[str, ParagraphStyle]:
    loc = _loc()
    cached = _STYLE_CACHE.get(loc.language)
    if cached is None:
        cached = _build_styles(loc)
        _STYLE_CACHE[loc.language] = cached
    return cached


def _escape(value: Any) -> str:
    """Report text is model-generated, so markup characters must be neutralised."""
    return escape_xml(value)


def _para(text: Any, style_key: str) -> Flowable:
    """Builds a paragraph that respects the report's text direction.

    ``text`` is passed as raw text: escaping happens after bidirectional
    reordering, because reordering an already-escaped entity such as ``&amp;``
    would reverse it into unreadable markup.
    """
    return _loc().paragraph(text, _styles()[style_key])


def _label(text: Any) -> Flowable:
    return _para(str(text or "").upper(), "label")


# ---------------------------------------------------------------------------
# Brand mark
# ---------------------------------------------------------------------------
def draw_mizan_mark(canvas: pdfcanvas.Canvas, x: float, y: float, size: float) -> None:
    """Draws the Mizaan logo: a white balance on a green rounded tile.

    ``x``/``y`` is the bottom-left corner of a ``size`` x ``size`` box.

    The geometry below is a direct transcription of the canonical brand asset
    ``halal-crypto-ui/public/mizan-ai-logo-square.svg`` (64-unit grid, y-down).
    The canvas is flipped so SVG coordinates can be used verbatim, which keeps
    this renderer and the SVG in sync: if the brand mark changes, update the
    paths here to match the new asset.

    Because the mark now carries its own green tile, it needs no light/dark
    variant — it renders identically on the dark cover panel and on white
    report pages.
    """
    canvas.saveState()

    # Map the SVG's 64-unit, y-down grid onto the requested y-up box.
    scale = size / 64.0
    canvas.translate(x, y + size)
    canvas.scale(scale, -scale)

    # Green tile with blended (rounded) sides. Clip to the rounded square, then
    # let the gradient fill the clip, matching the SVG's emerald->deep-teal ramp.
    canvas.saveState()
    tile = canvas.beginPath()
    tile.roundRect(0, 0, 64, 64, 15)
    canvas.clipPath(tile, stroke=0, fill=0)
    canvas.linearGradient(
        0,
        0,
        64,
        64,
        (BRAND_ACCENT, BRAND_PRIMARY, BRAND_DEEP),
        positions=(0.0, 0.55, 1.0),
        extend=True,
    )
    canvas.restoreState()

    # Hairline edge so the tile keeps its silhouette against white paper.
    canvas.setStrokeColor(colors.white)
    canvas.setStrokeAlpha(0.18)
    canvas.setLineWidth(1.5)
    canvas.roundRect(0.75, 0.75, 62.5, 62.5, 14.25, stroke=1, fill=0)
    canvas.setStrokeAlpha(1)

    canvas.setLineCap(1)
    canvas.setLineJoin(1)
    canvas.setStrokeColor(colors.white)
    canvas.setLineWidth(3.6)

    # Balance beam, central column and base. <path d="M15 26H49" /> etc.
    canvas.line(15, 26, 49, 26)
    canvas.line(32, 26, 32, 45)
    canvas.line(23, 46, 41, 46)

    # Scale pans. <path d="M10 30q6 8 12 0" /> and <path d="M42 30q6 8 12 0" />
    # Each quadratic curve is converted to the cubic form ReportLab draws.
    canvas.bezier(10, 30, 14, 35.333, 18, 35.333, 22, 30)
    canvas.bezier(42, 30, 46, 35.333, 50, 35.333, 54, 30)

    # Gold intelligence node above the pivot, with its highlight.
    canvas.setFillColor(BRAND_NODE)
    canvas.circle(32, 19, 4.6, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.circle(32, 19, 1.7, stroke=0, fill=1)

    canvas.restoreState()



# ---------------------------------------------------------------------------
# Custom flowables
# ---------------------------------------------------------------------------
class RiskMeter(Flowable):
    """Horizontal risk gauge with a banded track and score marker."""

    def __init__(self, score: int, width: float, height: float = 46):
        super().__init__()
        self.score = max(0, min(100, int(score)))
        self.width = width
        self.height = height

    def draw(self) -> None:
        canvas = self.canv
        bar_height = 11
        bar_y = 15
        color = risk_color(self.score)

        # Banded track communicates the thresholds themselves, not just the score.
        bands: Tuple[Tuple[int, int, colors.Color], ...] = (
            (0, 20, RISK_GREEN),
            (20, 40, RISK_YELLOW),
            (40, 70, RISK_ORANGE),
            (70, 100, RISK_RED),
        )
        for start, end, band_color in bands:
            x = self.width * (start / 100)
            band_width = self.width * ((end - start) / 100)
            canvas.setFillColor(band_color)
            canvas.setFillAlpha(0.16)
            canvas.rect(x, bar_y, band_width, bar_height, stroke=0, fill=1)
        canvas.setFillAlpha(1)

        # Filled progress up to the score.
        canvas.setFillColor(color)
        canvas.roundRect(
            0, bar_y, max(self.width * (self.score / 100), 3), bar_height, 5,
            stroke=0, fill=1,
        )

        # Marker and value.
        marker_x = min(max(self.width * (self.score / 100), 2), self.width - 2)
        canvas.setStrokeColor(colors.white)
        canvas.setLineWidth(2)
        canvas.line(marker_x, bar_y - 2, marker_x, bar_y + bar_height + 2)

        loc = _loc()
        canvas.setFillColor(color)
        canvas.setFont(loc.font_bold, 15)
        canvas.drawString(0, bar_y + bar_height + 8, f"{self.score}")
        canvas.setFillColor(INK_SOFT)
        canvas.setFont(loc.font, 8.5)
        canvas.drawString(
            stringWidth(f"{self.score}", loc.font_bold, 15) + 3,
            bar_y + bar_height + 8,
            "/ 100",
        )

        canvas.setFillColor(INK_SOFT)
        canvas.setFont(loc.font, 7)
        for label, position in (("0", 0.0), ("20", 0.2), ("40", 0.4), ("70", 0.7)):
            canvas.drawString(self.width * position, bar_y - 10, label)
        canvas.drawRightString(self.width, bar_y - 10, "100")


class Card(Flowable):
    """A rounded surface that wraps pre-built paragraph content."""

    def __init__(
        self,
        content: List[Flowable],
        width: float,
        *,
        accent: Optional[colors.Color] = None,
        background: colors.Color = colors.white,
        border: colors.Color = HAIRLINE,
        padding: float = 11,
    ):
        super().__init__()
        self.content = content
        self.width = width
        self.accent = accent
        self.background = background
        self.border = border
        self.padding = padding
        self._heights: List[float] = []
        self.height = 0.0

    @property
    def _inner_width(self) -> float:
        # Derived on demand: a card placed inside _Row has its width assigned
        # after construction, and wrapping against a stale (or negative) width
        # makes Paragraph report an effectively infinite height.
        return max(self.width - (2 * self.padding) - (4 if self.accent else 0), 1)

    def wrap(self, available_width: float, available_height: float):
        if not self.width:
            self.width = available_width
        total = 0.0
        self._heights = []
        for item in self.content:
            _, item_height = item.wrap(self._inner_width, available_height)
            self._heights.append(item_height)
            total += item_height
        self.height = total + (2 * self.padding)
        return self.width, self.height

    def draw(self) -> None:
        canvas = self.canv
        canvas.setFillColor(self.background)
        canvas.setStrokeColor(self.border)
        canvas.setLineWidth(0.7)
        canvas.roundRect(0, 0, self.width, self.height, 7, stroke=1, fill=1)

        if self.accent:
            canvas.setFillColor(self.accent)
            canvas.roundRect(0, 0, 6, self.height, 3, stroke=0, fill=1)
            canvas.rect(3, 0, 3, self.height, stroke=0, fill=1)

        x = self.padding + (4 if self.accent else 0)
        y = self.height - self.padding
        for item, item_height in zip(self.content, self._heights):
            y -= item_height
            item.drawOn(canvas, x, y)


class Badge(Flowable):
    """A pill-shaped status/priority label."""

    def __init__(
        self,
        text: str,
        fill: colors.Color,
        text_color: colors.Color = colors.white,
        font_size: float = 7,
    ):
        super().__init__()
        # Badges are a single short line, so shaping once here is enough: no
        # wrapping means no risk of reordering across a line break.
        self.text = _loc().shape(text)
        self.fill = fill
        self.text_color = text_color
        self.font_size = font_size
        self.width = stringWidth(self.text, _loc().font_bold, font_size) + 14
        self.height = font_size + 8

    def wrap(self, *_args):
        return self.width, self.height

    def draw(self) -> None:
        canvas = self.canv
        canvas.setFillColor(self.fill)
        canvas.roundRect(
            0, 0, self.width, self.height, self.height / 2, stroke=0, fill=1
        )
        canvas.setFillColor(self.text_color)
        canvas.setFont(_loc().font_bold, self.font_size)
        canvas.drawCentredString(self.width / 2, 4.5, self.text)


class BadgeRow(Flowable):
    """Places a title on the left and badges on the right of one line."""

    def __init__(self, title: str, badges: List[Badge], width: float):
        super().__init__()
        self.title = title
        self.badges = badges
        self.width = width
        self.height = 17

    def wrap(self, available_width: float, _available_height: float):
        self.width = available_width
        return self.width, self.height

    def draw(self) -> None:
        canvas = self.canv
        loc = _loc()
        canvas.setFillColor(INK)
        canvas.setFont(loc.font_bold, 10)

        badge_width = sum(badge.width + 5 for badge in self.badges)
        max_title_width = self.width - badge_width - 8

        # Truncation happens in logical order; the result is shaped afterwards
        # so cutting a word cannot leave a mis-joined Arabic glyph behind.
        title = self.title
        while title and stringWidth(
            loc.shape(title), loc.font_bold, 10
        ) > max_title_width:
            title = title[:-1]
        if title != self.title and len(title) > 1:
            title = title[:-1] + "…"

        if loc.is_rtl:
            # The title reads from the right edge; badges take the left.
            canvas.drawRightString(self.width, 4.5, loc.shape(title))
            x = 0.0
            for badge in self.badges:
                badge.drawOn(canvas, x, 1)
                x += badge.width + 5
            return

        canvas.drawString(0, 4.5, title)

        x = self.width
        for badge in reversed(self.badges):
            x -= badge.width
            badge.drawOn(canvas, x, 1)
            x -= 5


class Divider(Flowable):
    """A gradient-style rule used to separate major blocks."""

    def __init__(self, width: float, thickness: float = 2.5):
        super().__init__()
        self.width = width
        self.height = thickness
        self.thickness = thickness

    def wrap(self, available_width: float, _available_height: float):
        self.width = available_width
        return self.width, self.height

    def draw(self) -> None:
        canvas = self.canv
        steps = 60
        segment = self.width / steps
        for index in range(steps):
            ratio = index / (steps - 1)
            shade = colors.linearlyInterpolatedColor(
                BRAND_DEEP, BRAND_ACCENT, 0, 1, ratio
            )
            canvas.setFillColor(shade)
            canvas.rect(index * segment, 0, segment + 0.6, self.thickness,
                        stroke=0, fill=1)


class SectionHeading(Flowable):
    """Icon glyph plus title, with a hairline underneath."""

    def __init__(self, icon: str, title: str, width: float):
        super().__init__()
        self.icon = icon
        self.title = title
        self.width = width
        self.height = 30

    def wrap(self, available_width: float, _available_height: float):
        self.width = available_width
        return self.width, self.height

    def draw(self) -> None:
        canvas = self.canv
        loc = _loc()
        box = 17
        icon_x = self.width - box if loc.is_rtl else 0

        canvas.setFillColor(BRAND_PRIMARY)
        canvas.roundRect(icon_x, 9, box, box, 4.5, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont(loc.font_bold, 9)
        canvas.drawCentredString(icon_x + box / 2, 14, loc.shape(self.icon))

        canvas.setFillColor(INK)
        canvas.setFont(loc.font_bold, 13)
        if loc.is_rtl:
            canvas.drawRightString(
                self.width - box - 8, 13.5, loc.shape(self.title)
            )
        else:
            canvas.drawString(box + 8, 13.5, self.title)

        canvas.setStrokeColor(HAIRLINE)
        canvas.setLineWidth(0.7)
        canvas.line(0, 3, self.width, 3)


# ---------------------------------------------------------------------------
# Page furniture
# ---------------------------------------------------------------------------
class _ReportCanvas(pdfcanvas.Canvas):
    """Buffers pages so the footer can print 'Page X of Y'."""

    def __init__(self, *args, report_id: str = "", **kwargs):
        super().__init__(*args, **kwargs)
        self._report_id = report_id
        self._saved_pages: List[Dict[str, Any]] = []

    def showPage(self) -> None:  # noqa: N802 - ReportLab API
        self._saved_pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._saved_pages)
        for state in self._saved_pages:
            self.__dict__.update(state)
            # Page 1 is the cover and carries its own artwork.
            if self._pageNumber > 1:
                self._draw_header()
                self._draw_footer(self._pageNumber, total)
            super().showPage()
        super().save()

    def _draw_header(self) -> None:
        y = PAGE_HEIGHT - 15 * mm
        draw_mizan_mark(self, MARGIN_X, y - 2, 13)

        # Interior pages are white, so the running header must use ink colours.
        # These were previously white — the same value used on the dark cover —
        # which left the wordmark and report ID invisible on every page after
        # the first.
        loc = _loc()
        self.setFillColor(INK)
        self.setFont(loc.font_bold, 9.5)
        # The wordmark is a brand asset and stays in Latin script in every
        # language; the descriptor beneath it is translated.
        self.drawString(MARGIN_X + 17, y + 3, "MIZAAN AI")
        self.setFillColor(INK_SOFT)
        self.setFont(loc.font, 7)
        self.drawString(
            MARGIN_X + 17, y - 4, loc.shape(loc.text("header_subtitle"))
        )

        self.setFillColor(INK_SOFT)
        self.setFont(loc.font, 7.5)
        self.drawRightString(PAGE_WIDTH - MARGIN_X, y + 1, self._report_id)

        self.setStrokeColor(HAIRLINE)
        self.setLineWidth(0.7)
        self.line(MARGIN_X, y - 10, PAGE_WIDTH - MARGIN_X, y - 10)

    def _draw_footer(self, page_number: int, total: int) -> None:
        y = 13 * mm
        self.setStrokeColor(HAIRLINE)
        self.setLineWidth(0.7)
        self.line(MARGIN_X, y + 9, PAGE_WIDTH - MARGIN_X, y + 9)

        loc = _loc()
        self.setFont(loc.font, 7.5)
        self.setFillColor(INK_SOFT)
        self.drawString(MARGIN_X, y, loc.shape(loc.text("footer_left")))
        self.drawCentredString(
            PAGE_WIDTH / 2,
            y,
            loc.shape(loc.text("footer_page", page=page_number, total=total)),
        )
        self.drawRightString(
            PAGE_WIDTH - MARGIN_X,
            y,
            loc.shape(loc.text("footer_right", site=settings.brand_website)),
        )


class _CoverPage(Flowable):
    """Full-bleed cover artwork drawn as a single flowable."""

    def __init__(self, report: Dict[str, Any], generated_label: str):
        super().__init__()
        self.report = report
        self.generated_label = generated_label
        self.width = CONTENT_WIDTH
        self.height = 1

    def draw(self) -> None:
        canvas = self.canv
        canvas.saveState()
        # Undo the frame offset so the cover can paint the whole sheet.
        canvas.translate(-MARGIN_X, -(PAGE_HEIGHT - MARGIN_TOP))

        panel_height = PAGE_HEIGHT * 0.62
        panel_bottom = PAGE_HEIGHT - panel_height

        # Vertical gradient panel.
        steps = 160
        band = panel_height / steps
        for index in range(steps):
            ratio = index / (steps - 1)
            shade = colors.linearlyInterpolatedColor(
                BRAND_DEEP, BRAND_PRIMARY, 0, 1, ratio
            )
            canvas.setFillColor(shade)
            canvas.rect(
                0, PAGE_HEIGHT - (index + 1) * band, PAGE_WIDTH, band + 0.7,
                stroke=0, fill=1,
            )

        # Accent rule along the bottom edge of the panel.
        canvas.setFillColor(BRAND_ACCENT)
        canvas.rect(0, panel_bottom, PAGE_WIDTH, 3, stroke=0, fill=1)
        canvas.setFillColor(BRAND_GOLD)
        canvas.rect(0, panel_bottom, PAGE_WIDTH * 0.32, 3, stroke=0, fill=1)

        # Logo lock-up, centred on the page.
        #
        # The mark and the text keep their original relative positions; only the
        # group as a whole is centred. The lock-up width is measured from the
        # widest of the two text lines so the result is optically centred.
        loc = _loc()
        logo_size = 34
        logo_y = PAGE_HEIGHT - 42 * mm
        # The wordmark is a brand asset and is never transliterated.
        wordmark = "MIZAAN AI"
        tagline = loc.shape(loc.text("brand_tagline"))
        text_width = max(
            stringWidth(wordmark, loc.font_bold, 21),
            stringWidth(tagline, loc.font, 7.5),
        )
        lockup_width = logo_size + 12 + text_width
        lockup_x = (PAGE_WIDTH - lockup_width) / 2
        text_x = lockup_x + logo_size + 12

        draw_mizan_mark(canvas, lockup_x, logo_y, logo_size)
        canvas.setFillColor(colors.white)
        canvas.setFont(loc.font_bold, 21)
        canvas.drawString(text_x, logo_y + 16, wordmark)
        canvas.setFont(loc.font, 7.5)
        # White rather than the accent green: at 7.5pt the accent had too little
        # contrast against the dark green panel to stay legible.
        canvas.setFillColor(colors.white)
        canvas.drawString(text_x, logo_y + 5, tagline)

        # Title block, centred to match the lock-up above it.
        title_y = panel_bottom + 78 * mm
        page_centre = PAGE_WIDTH / 2
        canvas.setFillColor(colors.white)
        canvas.setFont(loc.font, 9)
        canvas.drawCentredString(
            page_centre, title_y + 26, loc.shape(loc.text("cover_kicker"))
        )
        canvas.setFont(loc.font_bold, 30)
        title = self.report["project_name"]
        while stringWidth(
            loc.shape(title), loc.font_bold, 30
        ) > CONTENT_WIDTH and len(title) > 4:
            title = title[:-1]
        if title != self.report["project_name"]:
            title = title[:-1] + "…"
        canvas.drawCentredString(page_centre, title_y, loc.shape(title))

        canvas.setStrokeColor(BRAND_ACCENT)
        canvas.setLineWidth(2.5)
        canvas.line(page_centre - 30, title_y - 12, page_centre + 30, title_y - 12)


        # Metadata grid on the light half of the page.
        meta_y = panel_bottom - 26 * mm
        entries = (
            (loc.text("cover_project"), self.report["project_name"]),
            (loc.text("cover_audit_type"), loc.audit_type(self.report["audit_type"])),
            (loc.text("cover_date"), self.generated_label),
            # Report IDs are machine identifiers and stay in logical order.
            (loc.text("cover_report_id"), self.report["report_id"]),
        )
        column_width = CONTENT_WIDTH / 2
        for index, (label, value) in enumerate(entries):
            col = index % 2
            row = index // 2
            x = MARGIN_X + (col * column_width)
            y = meta_y - (row * 22 * mm)
            rule_end = x + column_width - 14

            canvas.setFillColor(INK_SOFT)
            canvas.setFont(loc.font_bold, 7)
            canvas.setFillColor(INK_SOFT)
            if loc.is_rtl:
                canvas.drawRightString(rule_end, y + 13, loc.shape(label))
            else:
                canvas.drawString(x, y + 13, label)

            canvas.setFillColor(INK)
            canvas.setFont(loc.font_bold, 11.5)
            text = str(value)
            while stringWidth(
                loc.shape(text), loc.font_bold, 11.5
            ) > column_width - 14 and text:
                text = text[:-1]
            if text != str(value) and len(text) > 1:
                text = text[:-1] + "…"
            if loc.is_rtl:
                canvas.drawRightString(rule_end, y, loc.shape(text))
            else:
                canvas.drawString(x, y, text)

            canvas.setStrokeColor(HAIRLINE)
            canvas.setLineWidth(0.7)
            canvas.line(x, y - 8, rule_end, y - 8)

        # Confidentiality notice. The heading is a separate flowable rather
        # than inline <b> markup so RTL text never has to carry markup through
        # bidirectional reordering.
        styles = _styles()
        heading_style = ParagraphStyle(
            f"cover_notice_heading_{loc.language}",
            parent=styles["notice"],
            fontName=loc.font_bold,
            textColor=INK_MUTED,
        )
        notice_width = CONTENT_WIDTH - 40
        notice_parts = [
            loc.paragraph(loc.text("confidential"), heading_style),
            loc.paragraph(
                loc.confidentiality_notice(settings.brand_confidentiality_notice),
                styles["notice"],
            ),
        ]
        part_heights = [part.wrap(notice_width, 200)[1] for part in notice_parts]
        notice_height = sum(part_heights)
        box_height = notice_height + 18
        box_y = 20 * mm

        canvas.setFillColor(SURFACE)
        canvas.setStrokeColor(HAIRLINE)
        canvas.setLineWidth(0.7)
        canvas.roundRect(
            MARGIN_X, box_y, CONTENT_WIDTH, box_height, 6, stroke=1, fill=1
        )

        part_y = box_y + box_height - 9
        for part, height in zip(notice_parts, part_heights):
            part_y -= height
            part.drawOn(canvas, MARGIN_X + 20, part_y)

        canvas.setFillColor(INK_SOFT)
        canvas.setFont(loc.font, 7.5)
        canvas.drawCentredString(
            PAGE_WIDTH / 2,
            box_y - 12,
            loc.shape(loc.text("cover_footer", site=settings.brand_website)),
        )

        canvas.restoreState()


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------
def _heading(section_key: str) -> List[Flowable]:
    """Builds a localized section heading from its catalog key."""
    loc = _loc()
    return [
        SectionHeading(
            loc.section_icon(section_key),
            loc.text(f"section_{section_key}"),
            CONTENT_WIDTH,
        ),
        Spacer(1, 8),
    ]


def _metric_card(label: str, value: str, width: float,
                 accent: Optional[colors.Color] = None) -> Card:
    return Card(
        [
            _label(label),
            Spacer(1, 3),
            _para(value or "—", "metric"),
        ],
        width,
        accent=accent,
        background=SURFACE,
        padding=10,
    )


class _Row(Flowable):
    """Lays out flowables side by side with a fixed gutter."""

    def __init__(self, items: List[Flowable], gutter: float = 10):
        super().__init__()
        self.items = items
        self.gutter = gutter
        self.width = CONTENT_WIDTH
        self.height = 0.0

    def wrap(self, available_width: float, available_height: float):
        self.width = available_width
        count = len(self.items) or 1
        cell = (available_width - self.gutter * (count - 1)) / count
        heights = []
        for item in self.items:
            item.width = cell
            _, height = item.wrap(cell, available_height)
            heights.append(height)
        self.height = max(heights) if heights else 0
        return self.width, self.height

    def draw(self) -> None:
        count = len(self.items) or 1
        cell = (self.width - self.gutter * (count - 1)) / count
        x = 0.0
        for item in self.items:
            item.drawOn(self.canv, x, self.height - item.height)
            x += cell + self.gutter


def _executive_summary(report: Dict[str, Any]) -> List[Flowable]:
    loc = _loc()
    score = report["overall_shariah_risk_score"]
    band = report["risk_band"]
    confidence = report.get("confidence_level")
    confidence_text = (
        f"{round(confidence * 100)}%"
        if isinstance(confidence, (int, float))
        else loc.text("value_na")
    )

    verdict = report.get("overall_verdict") or loc.classification(
        report.get("classification")
    )

    story: List[Flowable] = _heading("executive_summary")

    story.append(
        Card(
            [
                _label(loc.text("label_overall_verdict")),
                Spacer(1, 4),
                _para(verdict or loc.text("empty_verdict"), "card_title"),
                Spacer(1, 8),
                _para(
                    report.get("executive_summary") or loc.text("empty_summary"),
                    "body",
                ),
            ],
            CONTENT_WIDTH,
            accent=risk_color(score),
        )
    )
    story.append(Spacer(1, 10))

    story.append(
        _Row(
            [
                _metric_card(
                    loc.text("label_risk_score"), f"{score} / 100", 0,
                    risk_color(score),
                ),
                _metric_card(
                    loc.text("label_confidence"), confidence_text, 0, BRAND_PRIMARY
                ),
                _metric_card(
                    loc.text("label_classification"),
                    loc.classification(report["classification"]),
                    0,
                    BRAND_GOLD,
                ),
            ]
        )
    )
    story.append(Spacer(1, 12))

    story.extend(_heading("risk_score"))
    story.append(
        Card(
            [
                _label(
                    loc.text(
                        "label_risk_exposure",
                        band=loc.risk_band(band.get("key")).upper(),
                    )
                ),
                Spacer(1, 6),
                RiskMeter(score, CONTENT_WIDTH - 22),
            ],
            CONTENT_WIDTH,
            background=colors.white,
        )
    )
    story.append(Spacer(1, 12))

    story.extend(_heading("key_findings"))
    findings = report.get("key_findings") or []
    if findings:
        cards: List[Flowable] = []
        for index, finding in enumerate(findings, start=1):
            cards.append(
                Card(
                    [
                        _label(loc.text("label_finding", index=f"{index:02d}")),
                        Spacer(1, 3),
                        _para(finding, "card_body"),
                    ],
                    CONTENT_WIDTH,
                    accent=BRAND_ACCENT,
                    background=SURFACE,
                    padding=9,
                )
            )
            cards.append(Spacer(1, 6))
        story.extend(cards)
    else:
        story.append(
            Card(
                [_para(loc.text("empty_key_findings"), "empty")],
                CONTENT_WIDTH,
                background=SURFACE,
            )
        )

    return story


def _findings_section(report: Dict[str, Any]) -> List[Flowable]:
    loc = _loc()
    story: List[Flowable] = _heading("compliance")
    indicators = report.get("shariah_indicators") or []

    if not indicators:
        story.append(
            Card(
                [_para(loc.text("empty_indicators"), "empty")],
                CONTENT_WIDTH,
                background=SURFACE,
            )
        )
        return story

    for indicator in indicators:
        badge_key = indicator.get("badge", "CONDITIONAL")
        accent, background = STATUS_COLORS.get(badge_key, STATUS_COLORS["CONDITIONAL"])

        content: List[Flowable] = [
            BadgeRow(
                # Raw text: BadgeRow draws straight onto the canvas, where XML
                # entities would print literally rather than being decoded.
                str(indicator.get("category") or "").strip(),
                [
                    Badge(loc.status(badge_key), accent),
                    Badge(
                        loc.text(
                            "badge_risk",
                            level=loc.risk_level(indicator.get("risk_level")),
                        ),
                        colors.white,
                        text_color=INK_MUTED,
                    ),
                ],
                CONTENT_WIDTH,
            ),
            Spacer(1, 6),
            _para(
                indicator.get("findings") or loc.text("empty_finding_text"),
                "card_body",
            ),
        ]

        evidence = indicator.get("evidence")
        if evidence:
            content.extend(
                [
                    Spacer(1, 6),
                    _label(loc.text("label_evidence")),
                    Spacer(1, 2),
                    _para(f"“{str(evidence).strip()}”", "quote"),
                ]
            )

        story.append(
            KeepTogether(
                Card(content, CONTENT_WIDTH, accent=accent, background=background)
            )
        )
        story.append(Spacer(1, 8))

    return story


def _recommendations_section(report: Dict[str, Any]) -> List[Flowable]:
    loc = _loc()
    story: List[Flowable] = _heading("recommendations")
    recommendations = report.get("actionable_recommendations") or []

    if not recommendations:
        story.append(
            Card(
                [_para(loc.text("empty_recommendations"), "empty")],
                CONTENT_WIDTH,
                background=SURFACE,
            )
        )
        return story

    for index, item in enumerate(recommendations, start=1):
        priority = item.get("priority", "MEDIUM")
        accent = PRIORITY_COLORS.get(priority, RISK_ORANGE)
        recommendation = str(item.get("recommendation") or "").strip()

        content: List[Flowable] = [
            BadgeRow(
                f"{index:02d}.  {recommendation[:70]}",
                [
                    Badge(
                        loc.text("badge_priority", priority=loc.priority(priority)),
                        accent,
                    )
                ],
                CONTENT_WIDTH,
            ),
            Spacer(1, 6),
            _para(recommendation, "card_body"),
        ]

        impact = item.get("expected_impact")
        if impact:
            content.extend(
                [
                    Spacer(1, 6),
                    _label(loc.text("label_expected_impact")),
                    Spacer(1, 2),
                    _para(impact, "card_body"),
                ]
            )

        story.append(
            KeepTogether(Card(content, CONTENT_WIDTH, accent=accent))
        )
        story.append(Spacer(1, 8))

    return story


def _references_section(report: Dict[str, Any]) -> List[Flowable]:
    loc = _loc()
    story: List[Flowable] = _heading("references")
    references = report.get("quran_hadith_references") or []

    if not references:
        story.append(
            Card(
                [_para(loc.text("empty_references"), "empty")],
                CONTENT_WIDTH,
                background=SURFACE,
                accent=BRAND_GOLD,
            )
        )
        return story

    for reference in references:
        content: List[Flowable] = []
        if reference.get("source"):
            content.extend([_label(reference["source"]), Spacer(1, 4)])
        if reference.get("text"):
            content.append(_para(f"“{str(reference['text']).strip()}”", "quote"))
        if reference.get("relevance"):
            content.extend(
                [
                    Spacer(1, 6),
                    _label(loc.text("label_relevance")),
                    Spacer(1, 2),
                    _para(reference["relevance"], "card_body"),
                ]
            )

        story.append(
            KeepTogether(
                Card(
                    content,
                    CONTENT_WIDTH,
                    accent=BRAND_GOLD,
                    background=colors.HexColor("#FFFBEB"),
                    padding=13,
                )
            )
        )
        story.append(Spacer(1, 8))

    return story


def _list_section(section_key: str, items: List[str],
                  empty_key: str) -> List[Flowable]:
    loc = _loc()
    story: List[Flowable] = _heading(section_key)

    if not items:
        story.append(
            Card(
                [_para(loc.text(empty_key), "empty")],
                CONTENT_WIDTH,
                background=SURFACE,
            )
        )
        return story

    bullets: List[Flowable] = []
    for item in items:
        # The bullet leads the line in both directions: the bidi algorithm
        # mirrors it to the right-hand side for RTL automatically.
        bullets.append(_para(f"•  {str(item).strip()}", "card_body"))
        bullets.append(Spacer(1, 5))
    story.append(Card(bullets[:-1], CONTENT_WIDTH, background=colors.white))
    return story


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def build_audit_pdf(
    raw_report: Optional[Dict[str, Any]],
    *,
    report_id: Optional[str] = None,
    audit_type: Optional[str] = None,
    generated_at: Optional[datetime] = None,
    language: Optional[str] = None,
) -> bytes:
    """Renders a normalized report into PDF bytes.

    ``language`` selects the language of everything the renderer contributes.
    It defaults to the language stored on the report itself, so re-downloading
    an old audit reproduces the document the user originally received.
    """
    # ``raw_report`` may legitimately be None (a corrupt or empty history row),
    # in which case the report is rendered entirely from schema defaults.
    source = raw_report or {}

    # Activated for the whole render: flowables read the localizer at draw
    # time, which happens inside doc.build() rather than here.
    localizer, token = use_language(
        language if language is not None else source.get("language")
    )
    try:
        return _render(
            raw_report,
            localizer,
            report_id=report_id,
            audit_type=audit_type,
            generated_at=generated_at,
        )
    finally:
        reset_language(token)


def _render(
    raw_report: Optional[Dict[str, Any]],
    localizer: Localizer,
    *,
    report_id: Optional[str],
    audit_type: Optional[str],
    generated_at: Optional[datetime],
) -> bytes:
    report = normalize_report(
        raw_report,
        report_id=report_id,
        audit_type=audit_type,
        generated_at=generated_at,
        language=localizer.language,
    )

    moment = generated_at or datetime.now(timezone.utc)
    # strftime's month names follow the process locale, not the report, so the
    # date is composed from the catalog instead.
    generated_label = localizer.format_date(moment)

    buffer = io.BytesIO()
    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        title=f"{report['project_name']} — {localizer.text('doc_title_suffix')}",
        author="Mizaan AI",
        subject=localizer.audit_type(report["audit_type"]),
        creator="Mizaan AI",

        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
    )
    frame = Frame(
        MARGIN_X,
        MARGIN_BOTTOM,
        CONTENT_WIDTH,
        PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM,
        id="content",
        showBoundary=0,
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame])])

    story: List[Flowable] = [
        _CoverPage(report, generated_label),
        PageBreak(),
    ]

    story.extend(_executive_summary(report))
    story.append(Spacer(1, 6))
    story.append(Divider(CONTENT_WIDTH))
    story.append(Spacer(1, 14))

    story.extend(_findings_section(report))
    story.append(Spacer(1, 6))
    story.append(Divider(CONTENT_WIDTH))
    story.append(Spacer(1, 14))

    # Every section is rendered unconditionally: an audit report's structure is
    # part of its meaning, so an empty section must say so explicitly rather
    # than vanish and leave the reader unsure whether it was ever assessed.
    story.extend(
        _list_section(
            "risk_factors",
            report.get("tokenomics_risk_factors") or [],
            "empty_risk_factors",
        )
    )
    story.append(Spacer(1, 14))

    story.extend(
        _list_section(
            "scholarly",
            report.get("scholarly_disagreements") or [],
            "empty_scholarly",
        )
    )
    story.append(Spacer(1, 14))

    story.extend(_recommendations_section(report))
    story.append(Spacer(1, 6))
    story.append(Divider(CONTENT_WIDTH))
    story.append(Spacer(1, 14))

    story.extend(_references_section(report))
    story.append(Spacer(1, 16))

    story.append(
        Card(
            [
                _label(localizer.text("label_important_notice")),
                Spacer(1, 4),
                _para(
                    localizer.confidentiality_notice(
                        settings.brand_confidentiality_notice
                    ),
                    "card_body",
                ),
            ],
            CONTENT_WIDTH,
            background=SURFACE,
            accent=BRAND_DEEP,
        )
    )

    def _make_canvas(*args, **kwargs):
        return _ReportCanvas(*args, report_id=report["report_id"], **kwargs)

    doc.build(story, canvasmaker=_make_canvas)
    return buffer.getvalue()
