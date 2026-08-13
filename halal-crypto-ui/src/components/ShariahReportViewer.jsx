import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { generateAuditPDF, UnsupportedScriptError } from '../utils/pdfGenerator';
import { auditApi, historyApi, tokenStore } from '../api/client';
import { buildWhatsAppMessage, shareOnWhatsApp } from '../utils/whatsappShare';

// Mirrors RTL_LANGUAGES in report_i18n.py, which makes the same decision for
// the PDF. Kept local so the viewer has no dependency on the backend catalog.
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

/**
 * `readOnly` renders the report for someone following a share link: the
 * owner-only actions (export, share, Scholar AI) are withheld because they all
 * require an authenticated session that a public visitor does not have.
 */
export default function ShariahReportViewer({ report, onReset, readOnly = false }) {
  const { t, i18n } = useTranslation();

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [userQuery, setUserQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Share dropdown & Report references (declared only once)
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  // { message, webUrl } — a friendly explanation plus a link the user can click
  // themselves when the WhatsApp hand-off did not happen.
  const [shareNotice, setShareNotice] = useState(null);
  const dropdownRef = useRef(null);
  const reportRef = useRef(null);

  // Handle click outside to close share dropdown.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsShareOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!report) return null;

  // Theme-aware Risk Score Color Logic
  const getScoreColor = (score) => {
    if (score <= 30) {
      return 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20';
    }
    if (score <= 60) {
      return 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20';
    }
    return 'text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-950/20';
  };

  /**
   * The archived, server-rendered report is the authoritative document: it is
   * the full multi-page audit with cover page, running header/footer metadata
   * and risk graphics. The browser renderer is only a fallback for the rare
   * case where archiving failed and there is no stored report to fetch.
   */
  const handleDownloadPDF = async () => {
    try {
      setIsShareOpen(false);
      setIsExporting(true);

      if (report.audit_id) {
        await historyApi.downloadPdf(
          report.audit_id,
          `Mizaan-Audit-${report.project_name || 'Report'}.pdf`,
        );
        return;
      }

      // Browser-side fallback, used only when the audit was never archived.
      // It cannot render Arabic, so that case is reported honestly instead of
      // downloading a file of unreadable glyphs.
      await generateAuditPDF(report);
    } catch (err) {
      console.error('Download PDF error:', err);
      if (err instanceof UnsupportedScriptError) {
        alert(
          t(
            'pdf_needs_server',
            'This report could not be saved and must be regenerated before it '
              + 'can be downloaded in Arabic. Please run the audit again.',
          ),
        );
      } else {
        alert(t('pdf_failed', 'Could not generate PDF download. Please try again.'));
      }
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Risk band label, matching the wording shown on the score badge.
   *
   * Takes the translator as an argument so the same bands can be rendered in
   * the interface language on screen and in the report's language when shared.
   */
  const getRiskLevel = (score, translate = t) => {
    if (score <= 30) return translate('low_shariah_risk', 'Low Shariah Risk');
    if (score <= 60) return translate('moderate_shariah_risk', 'Moderate Shariah Risk');
    return translate('high_shariah_risk', 'High Shariah Risk');
  };

  /**
   * Shares a short branded summary on WhatsApp, with a link to the full report.
   *
   * The chat deliberately carries a summary rather than the audit itself: the
   * findings, indicators and references belong in the report, which is
   * published behind an unguessable link only when the user shares it. A report
   * that was never archived has no link to publish, so the message goes out as
   * a summary alone rather than pointing at a page that cannot be opened.
   */
  const handleWhatsAppShare = async () => {
    if (isSharing) return;

    setIsShareOpen(false);
    setShareNotice(null);
    setIsSharing(true);

    try {
      let reportUrl = '';
      if (report.audit_id) {
        try {
          reportUrl = (await historyApi.share(report.audit_id))?.share_url || '';
        } catch (err) {
          // Sharing the summary is still useful without the link, so a failure
          // here degrades the message instead of blocking the share.
          console.error('Share link error:', err);
        }
      }

      // The report, not the current interface, decides the message language:
      // a French audit shared while the UI is English must arrive in French,
      // exactly like the PDF download. `getFixedT` returns a translator bound
      // to that language (falling back to English for unknown codes).
      const reportLanguage = report.language || i18n.resolvedLanguage || 'en';
      const tr = i18n.getFixedT(reportLanguage);

      const message = buildWhatsAppMessage({
        projectName: report.project_name,
        symbol: report.token_ticker,
        riskScore: report.overall_shariah_risk_score,
        riskLevel: getRiskLevel(report.overall_shariah_risk_score, tr),
        executiveSummary: report.executive_summary,
        reportUrl,
        // Keeps the ticker and the link readable inside Arabic text.
        isRtl: RTL_LANGUAGES.has(reportLanguage),
        labels: {
          title: tr('whatsapp_share_title', 'Mizaan AI — Shariah Compliance Audit'),
          project: tr('project', 'Project'),
          riskScore: tr('risk_score', 'Risk Score'),
          riskLevel: tr('risk_level', 'Risk Level'),
          summary: tr('executive_summary', 'Executive Summary'),
          fullReport: tr('whatsapp_view_full_report', 'View the complete audit report'),
          poweredBy: tr('whatsapp_powered_by', 'Powered by Mizaan AI'),
        },
      });

      const { opened, webUrl } = await shareOnWhatsApp(message);

      if (!opened) {
        setShareNotice({
          message: t(
            'whatsapp_open_failed',
            'Unable to open WhatsApp. Please make sure WhatsApp is installed, '
              + 'or continue with WhatsApp Web.',
          ),
          webUrl,
        });
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopySummary = async () => {
    setIsShareOpen(false);
    const summaryText = `${t('shariah_audit_report', 'Shariah Audit')}: ${report.project_name}\n${t('risk_score', 'Risk Score')}: ${report.overall_shariah_risk_score}/100\n\n${report.executive_summary}`;
    await navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Send follow-up question to Scholar AI Chat Assistant Endpoint
  const handleSendQuestion = async (e) => {
    e.preventDefault();
    if (!userQuery.trim() || isAsking) return;

    if (!tokenStore.get()) {
      setChatMessages((prev) => [
        ...prev,
        { sender: 'ai', text: t('token_missing_error', 'Authentication token missing. Please log in again to use Scholar AI.') },
      ]);
      return;
    }

    const newQuestion = userQuery;
    setUserQuery('');
    setChatMessages((prev) => [...prev, { sender: 'user', text: newQuestion }]);
    setIsAsking(true);

    try {
      const auditContext = JSON.stringify({
        project_name: report.project_name,
        overall_shariah_risk_score: report.overall_shariah_risk_score,
        executive_summary: report.executive_summary,
        shariah_indicators: report.shariah_indicators,
        scholarly_disagreements: report.scholarly_disagreements,
        tokenomics_risk_factors: report.tokenomics_risk_factors,
        actionable_recommendations: report.actionable_recommendations,
      });

      const data = await auditApi.scholarChat(newQuestion, auditContext);
      const answer = data.reply || t('no_response_error', 'I was unable to generate a response.');

      setChatMessages((prev) => [
        ...prev,
        { sender: 'ai', text: answer },
      ]);

    } catch (err) {
      console.error('Scholar AI Error:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: err.message || t('connection_error', 'Error connecting to Scholar AI. Please check server connection.'),
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const mismatchWarningText = report.input_correction_notes || report.input_mismatch_warning || report.mismatch_warning;

  return (
    <div 
      id="shariah-report"
      className="relative max-w-5xl mx-auto space-y-6 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300"
    >

      {/* WhatsApp fallback notice.
          Shown only when the hand-off did not happen, and it carries the
          WhatsApp Web link so the user can finish the share in one click
          rather than being told to start again. */}
      {shareNotice && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-xl px-4 py-3 shadow-md"
        >
          <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <span className="mr-1.5">⚠️</span>
            {shareNotice.message}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={shareNotice.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShareNotice(null)}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition"
            >
              {t('open_whatsapp_web', 'WhatsApp Web')}
            </a>
            <button
              onClick={() => setShareNotice(null)}
              aria-label={t('dismiss', 'Dismiss')}
              className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 text-xs font-bold px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Top Controls Bar */}
      {!readOnly && (
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 shadow-md transition-colors duration-300">
        <button
          onClick={onReset}
          className="text-xs text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 transition cursor-pointer font-medium"
        >
          ← {t('analyze_another_project', 'Analyze Another Project')}
        </button>

        <div className="flex items-center gap-3">
          {report.report_id && (
            <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
              {t('report_id', 'ID')}: <strong className="text-slate-800 dark:text-slate-200">{report.report_id}</strong>
            </span>
          )}
          {typeof report.confidence_level === 'number' && (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {t('ai_confidence', 'AI Confidence')}: <strong className="text-emerald-600 dark:text-emerald-400">{Math.round(report.confidence_level * 100)}%</strong>
            </span>
          )}

          {/* Share & Download Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsShareOpen(!isShareOpen)}
              disabled={isExporting}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <span>{isExporting ? t('generating_pdf', '🌀 Generating PDF...') : `🔗 ${t('share_export', 'Share & Export')}`}</span>
              <span className="text-[9px]">{isShareOpen ? '▲' : '▼'}</span>
            </button>

            {/* Dropdown Menu */}
            {isShareOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 py-1 text-xs divide-y divide-slate-100 dark:divide-slate-800">
                <div className="py-1">
                  <button
                    onClick={handleDownloadPDF}
                    className="w-full text-left px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center gap-2 cursor-pointer"
                  >
                    <span>📥</span> {t('download_pdf', 'Download PDF File')}
                  </button>
                  <button
                    onClick={handleWhatsAppShare}
                    disabled={isSharing}
                    className="w-full text-left px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>💬</span>
                    {isSharing
                      ? t('opening_whatsapp', 'Opening WhatsApp...')
                      : t('share_whatsapp', 'Share via WhatsApp')}
                  </button>
                </div>
                <div className="py-1">
                  <button
                    onClick={handleCopySummary}
                    className="w-full text-left px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center gap-2 cursor-pointer"
                  >
                    <span>📋</span> {copied ? t('copied_to_clipboard', 'Copied to Clipboard!') : t('copy_summary', 'Copy Summary')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Scholar AI Drawer Toggle */}
          <button
            onClick={() => setIsAssistantOpen(!isAssistantOpen)}
            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
          >
            💬 {isAssistantOpen ? t('hide_assistant', 'Hide Assistant') : t('ask_scholar_ai', 'Ask Scholar AI')}
          </button>
        </div>
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Audit Report Column */}
        <div 
          ref={reportRef} 
          className={`space-y-6 transition-all duration-300 ${isAssistantOpen ? 'lg:col-span-2' : 'lg:col-span-3'}`}
        >
          {mismatchWarningText && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-xl p-4 shadow-md">
              <h4 className="text-amber-800 dark:text-amber-300 font-bold text-xs flex items-center gap-2 mb-1.5">
                <span className="text-sm">⚠️</span> {t('input_mismatch_title', 'Input Mismatch Detected & Corrected')}
              </h4>
              <p className="text-amber-900 dark:text-amber-200 text-xs leading-relaxed opacity-90">
                {mismatchWarningText}
              </p>
            </div>
          )}

          {/* Header & Risk Score Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors duration-300">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{report.project_name}</h1>
                {report.token_ticker && (
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-mono font-bold px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
                    ${report.token_ticker}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('engine_tagline', 'Generated by Mizaan Ethics Engine')}</p>
            </div>

            <div className={`border px-6 py-3 rounded-2xl text-center shadow-sm ${getScoreColor(report.overall_shariah_risk_score)}`}>
              <span className="text-3xl font-extrabold block leading-tight">{report.overall_shariah_risk_score} / 100</span>
              <span className="text-[11px] font-bold tracking-wide uppercase">
                {report.overall_shariah_risk_score <= 30
                  ? t('low_shariah_risk', 'Low Shariah Risk')
                  : report.overall_shariah_risk_score <= 60
                  ? t('moderate_shariah_risk', 'Moderate Shariah Risk')
                  : t('high_shariah_risk', 'High Shariah Risk')}
              </span>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-3 transition-colors duration-300">
            <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <span>📖</span> {t('executive_summary', 'Executive Summary')}
            </h3>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{report.executive_summary}</p>
          </div>

          {/* Shariah Assessment Indicators */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 transition-colors duration-300">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('core_findings_title', 'Core Jurisprudential Findings (Fiqh al-Muamalat)')}
            </h3>
            <div className="space-y-3">
              {report.shariah_indicators?.map((indicator, idx) => {
                const isNonCompliant = indicator.status?.toLowerCase().includes('non-compliant') || indicator.status === 'FAIL';
                const isConditional = indicator.status?.toLowerCase().includes('conditional');
                return (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 space-y-2 transition-colors duration-300">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{indicator.category}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                          !isNonCompliant && !isConditional
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800/50'
                            : isNonCompliant
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-400 border-rose-300 dark:border-rose-800/50'
                            : 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-400 border-purple-300 dark:border-purple-800/50'
                        }`}
                      >
                        {indicator.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      <strong className="text-slate-900 dark:text-slate-100">{t('findings_label', 'Findings')}:</strong> {indicator.findings}
                    </p>
                    {indicator.evidence && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-lg p-2.5 text-[11px] font-mono text-slate-600 dark:text-slate-400 italic">
                        <strong className="text-slate-800 dark:text-slate-300">{t('evidence_label', 'Evidence')}:</strong> "{indicator.evidence}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tokenomics & Scholarly Notes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Tokenomics Risk Factors */}
            {report.tokenomics_risk_factors?.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-3 transition-colors duration-300">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <span>⚙️</span> {t('risk_factors_title', 'Risk Factors')}
                </h3>
                <ul className="space-y-2">
                  {report.tokenomics_risk_factors.map((risk, idx) => (
                    <li key={idx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                      <span className="text-amber-500">•</span>
                      <span>{typeof risk === 'object' && risk !== null ? JSON.stringify(risk) : risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Scholarly Disagreements / Perspectives */}
            {report.scholarly_disagreements?.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-3 transition-colors duration-300">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <span>⚖️</span> {t('scholarly_perspectives_title', 'Scholarly Perspectives')}
                </h3>
                <ul className="space-y-2">
                  {report.scholarly_disagreements.map((note, idx) => (
                    <li key={idx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                      <span className="text-indigo-500">▪</span>
                      <span>{typeof note === 'object' && note !== null ? JSON.stringify(note) : note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>

          {/* Actionable Recommendations */}
          {report.actionable_recommendations?.length > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-6 shadow-xl space-y-3 transition-colors duration-300">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <span>💡</span> {t('actionable_recommendations_title', 'Actionable Recommendations for Compliance')}
              </h3>
              <div className="space-y-2">
                {report.actionable_recommendations.map((rec, idx) => {
                  const isObject = typeof rec === 'object' && rec !== null;
                  const recommendationText = isObject 
                    ? (rec.recommendation || rec.description || JSON.stringify(rec)) 
                    : rec;
                  const priority = isObject ? rec.priority : null;
                  const impact = isObject ? rec.expected_impact : null;

                  return (
                    <div key={idx} className="flex items-start gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-xs text-slate-800 dark:text-slate-200 shadow-sm">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                      </span>
                      <div className="space-y-1">
                        <p className="leading-relaxed">
                          {priority && (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400 mr-1.5">
                              [{priority.toUpperCase()}]
                            </span>
                          )}
                          {recommendationText}
                        </p>
                        {impact && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            Expected Impact: {impact}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Assistant Drawer */}
        {isAssistantOpen && (
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col h-[650px] sticky top-6 transition-colors duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>💬</span> {t('scholar_assistant_title', 'Scholar AI Assistant')}
              </h3>
              <button
                onClick={() => setIsAssistantOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-bold px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Chat Thread */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs pr-1">
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-slate-600 dark:text-slate-400">
                👋 {t('assistant_welcome', 'Asking follow-up questions about')} <strong className="text-slate-800 dark:text-slate-200">{report.project_name}</strong>? {t('assistant_welcome_hint', 'Ask about specific pools, yield mechanics, or purification rules!')}
              </div>

              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl max-w-[90%] text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200 ml-auto'
                      : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 mr-auto prose dark:prose-invert'
                  }`}
                >
                  {msg.sender === 'ai' ? (
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  ) : (
                    msg.text
                  )}
                </div>
              ))}

              {isAsking && (
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500 p-3 rounded-xl animate-pulse">
                  {t('assistant_thinking', 'Scholar AI is analyzing protocol rules...')}
                </div>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendQuestion} className="pt-2 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder={t('ask_followup_placeholder', 'Ask a follow-up...')}
                className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
              />
              <button
                type="submit"
                disabled={isAsking || !userQuery.trim()}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-slate-950 font-bold px-3 py-2 rounded-lg text-xs transition cursor-pointer"
              >
                {t('send_button', 'Send')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}