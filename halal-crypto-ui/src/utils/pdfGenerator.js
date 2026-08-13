import jsPDF from 'jspdf';
import 'jspdf-autotable';

const safeArray = (value) => (Array.isArray(value) ? value : []);

const loadSvgLogoAsPngDataUrl = async (svgUrl) => {
  const response = await fetch(svgUrl);
  if (!response.ok) {
    throw new Error(`Failed to load logo: ${response.statusText}`);
  }
  const svgText = await response.text();
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 400;
    canvas.height = image.naturalHeight || 120;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
};

const addWatermark = (doc, text) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setTextColor(240, 244, 248);
  doc.setFontSize(60);
  doc.text(text, pageWidth / 2, pageHeight / 2, {
    align: 'center',
    angle: 45,
  });
  doc.setTextColor(0, 0, 0);
};

const addFooter = (doc, report, pageIndex, pageCount) => {
  if (pageIndex === 1) return; // Skip footer on cover page

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Report ID: ${report.report_id || 'N/A'}`, 40, pageHeight - 30);
  doc.text(`Page ${pageIndex} of ${pageCount}`, pageWidth - 40, pageHeight - 30, {
    align: 'right',
  });
};

const drawRiskGauge = (doc, score, x, y) => {
  const size = 130;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = 52;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(12);
  doc.circle(centerX, centerY, radius, 'S');

  const color = score <= 30 ? [34, 197, 94] : score <= 60 ? [234, 179, 8] : [239, 68, 68];
  doc.setDrawColor(...color);
  doc.setLineWidth(14);

  const progress = Math.min(Math.max(score, 0), 100) / 100;
  if (progress > 0) {
    doc.circle(centerX, centerY, radius, 'S');
  }

  doc.setFontSize(26);
  doc.setTextColor(15, 23, 42);
  doc.text(`${score}`, centerX, centerY + 10, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Shariah Risk Score', centerX, centerY + 24, { align: 'center' });
};

/**
 * Scripts this browser-side renderer cannot draw.
 *
 * jsPDF's built-in fonts are WinAnsi-encoded, so they contain no Arabic
 * glyphs, and jsPDF applies neither Arabic contextual shaping nor Unicode
 * bidirectional reordering. An Arabic report rendered here comes out as
 * disconnected letters in reversed order — the exact defect the server-side
 * renderer was fixed to avoid.
 *
 * Rather than ship a second, worse Arabic implementation, this path refuses
 * the job so the caller can fall back to the server renderer.
 */
const UNSUPPORTED_SCRIPT = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export class UnsupportedScriptError extends Error {
  constructor() {
    super('This report language can only be rendered by the server.');
    this.name = 'UnsupportedScriptError';
  }
}

export const generateAuditPDF = async (report) => {
  const isRtlReport =
    report?.language === 'ar' ||
    UNSUPPORTED_SCRIPT.test(
      `${report?.executive_summary || ''}${report?.project_name || ''}`,
    );

  if (isRtlReport) {
    throw new UnsupportedScriptError();
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 515pt total
  const fileName = `${report.project_name || 'Audit'}_MIZAAN_Report.pdf`;
  const now = new Date();
  const generatedAt = now.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let logoDataUrl = null;
  try {
    // Ensure we request the new logo file placed in the public directory.
    // The frontend serves `/mizan-ai-logo.svg` so use that path.
    logoDataUrl = await loadSvgLogoAsPngDataUrl('/mizan-ai-logo.svg');
  } catch (err) {
    console.warn('Could not load logo for PDF embed:', err);
  }

  // ==================== PAGE 1: COVER PAGE ====================
  // Use the deep brand green (#064e3b) for the banner background and
  // high-contrast white text for all header elements for legibility.
  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, pageWidth, 160, 'F');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, 28, 160, 48);
  } else {
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.text('MIZAAN', margin, 65);
  }

  doc.setFontSize(14);
  // Use pure white for subtitle to ensure maximum contrast on dark green.
  doc.setTextColor(255, 255, 255);
  doc.text('Shariah Compliance Audit Report', margin, 115);

  const startBodyY = 240;
  doc.setFontSize(32);
  doc.setTextColor(15, 23, 42);
  doc.text(report.project_name || 'Protocol Audit', margin, startBodyY);

  doc.setFontSize(14);
  doc.setTextColor(5, 150, 105);
  doc.text(`Ticker: $${report.token_ticker || 'N/A'}`, margin, startBodyY + 30);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(margin, startBodyY + 55, pageWidth - margin, startBodyY + 55);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Report ID: ${report.report_id || 'N/A'}`, margin, startBodyY + 85);
  doc.text(`Generated: ${generatedAt}`, margin, startBodyY + 105);

  // ==================== PAGE 2: EXECUTIVE SUMMARY & FINDINGS ====================
  doc.addPage();
  addWatermark(doc, 'MIZAAN');

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Executive Summary', margin, 50);

  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99);
  const summary = report.executive_summary || 'No executive summary available.';
  doc.text(doc.splitTextToSize(summary, contentWidth - 170), margin, 70);

  drawRiskGauge(doc, report.overall_shariah_risk_score ?? 0, pageWidth - margin - 150, 60);

  const snapshotTop = 220;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(pageWidth - margin - 170, snapshotTop, 170, 140, 10, 10, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text('Report Snapshot', pageWidth - margin - 155, snapshotTop + 20);
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  doc.text(`Risk Score: ${report.overall_shariah_risk_score ?? 'N/A'}/100`, pageWidth - margin - 155, snapshotTop + 40);
  doc.text(`Confidence: ${Math.round((report.confidence_level ?? 0) * 100)}%`, pageWidth - margin - 155, snapshotTop + 58);
  doc.text(`Token: ${report.token_ticker || 'N/A'}`, pageWidth - margin - 155, snapshotTop + 76);
  doc.text(`Project: ${report.project_name || 'N/A'}`, pageWidth - margin - 155, snapshotTop + 94);
  doc.text(`Report ID: ${report.report_id || 'N/A'}`, pageWidth - margin - 155, snapshotTop + 112);

  const tableRows = safeArray(report.shariah_indicators).map((indicator) => [
    indicator.category || 'Category',
    indicator.status || 'Status',
    indicator.findings || 'Findings not available',
  ]);

  doc.autoTable({
    startY: 380,
    head: [['Indicator', 'Status', 'Findings']],
    body: tableRows.length ? tableRows : [['No core findings available', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [5, 150, 105], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 6, textColor: [51, 65, 85] },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 90 },
      2: { cellWidth: contentWidth - 210 }, // 120 + 90 + 305 = 515pt total
    },
    margin: { left: margin, right: margin },
  });

  // Helper for dynamic list wrapping and rendering
  const drawWrappedList = (doc, items, startY, bulletPrefix = '') => {
    let currentY = startY;
    const safeItems = safeArray(items);

    if (safeItems.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('None specified.', margin, currentY);
      return currentY + 20;
    }

    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);

    safeItems.forEach((item, index) => {
      let textString = '';
      if (typeof item === 'string') {
        textString = item;
      } else if (typeof item === 'object' && item !== null) {
        textString = item.recommendation || item.text || item.description || JSON.stringify(item);
      }

      const fullText = bulletPrefix ? `${bulletPrefix} ${textString}` : `${index + 1}. ${textString}`;
      const lines = doc.splitTextToSize(fullText, contentWidth);
      const blockHeight = lines.length * 14;

      if (currentY + blockHeight > pageHeight - margin - 30) {
        doc.addPage();
        addWatermark(doc, 'MIZAAN');
        currentY = margin + 20;
      }

      doc.text(lines, margin, currentY);
      currentY += blockHeight + 6;
    });

    return currentY + 10;
  };

  // ==================== DYNAMIC SECTIONS ====================
  let currentY = doc.previousAutoTable ? doc.previousAutoTable.finalY + 25 : 430;

  // Every section is always rendered so the document keeps a consistent audit
  // structure; each one starts a fresh page when it cannot fit on the current
  // one rather than being dropped.
  const drawSection = (title, items, bulletPrefix = '') => {
    if (currentY + 60 > pageHeight - margin - 30) {
      doc.addPage();
      addWatermark(doc, 'MIZAAN');
      currentY = margin + 20;
    }

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin, currentY);
    currentY = drawWrappedList(doc, items, currentY + 18, bulletPrefix);
  };

  // 1. Qur'an / Hadith References
  drawSection('Qur’an / Hadith References', report.quran_hadith_references || report.references);

  // 2. Scholarly Disagreements
  drawSection('Scholarly Disagreements', report.scholarly_disagreements, '•');

  // 3. Actionable Recommendations
  drawSection('Actionable Recommendations', report.actionable_recommendations, '✓');

  // Footers
  const pageCount = doc.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    doc.setPage(pageIndex);
    addFooter(doc, report, pageIndex, pageCount);
  }

  try {
    const pdfBlob = doc.output('blob');
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(pdfBlob, fileName);
      return;
    }
    const blobUrl = URL.createObjectURL(pdfBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = fileName;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    setTimeout(() => {
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(blobUrl);
    }, 200);
  } catch (error) {
    console.error('PDF download failed:', error);
    doc.save(fileName);
  }
};
