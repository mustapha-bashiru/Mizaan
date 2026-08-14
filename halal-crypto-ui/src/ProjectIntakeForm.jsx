import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { emailStore } from './api/client';
import {
  DEFAULT_CRYPTO_CATEGORY,
  categoryGroupsForMode,
  defaultCategoryForMode,
  filterCategoryGroups,
  isKnownCategory,
} from './config/auditCategories';

export default function ProjectIntakeForm({ onSubmit, isLoading, prefill }) {

  const { t } = useTranslation();
  const [auditMode, setAuditMode] = useState('crypto'); // 'crypto' or 'ecommerce'

  const [formData, setFormData] = useState({
    projectName: '',
    tokenTicker: '',
    protocolCategory: DEFAULT_CRYPTO_CATEGORY,
    liveUrl: '',
    yieldMechanics: '',
    whitepaperContext: '',
    email: '',
  });

  const [attachments, setAttachments] = useState([]);

  // The taxonomy is intentionally long, so the select is paired with a filter
  // box; scrolling ~70 grouped options to find "Meme / Community Token" is
  // slower than typing "meme".
  const [categoryQuery, setCategoryQuery] = useState('');

  const categoryGroups = useMemo(
    () => categoryGroupsForMode(auditMode),
    [auditMode],
  );

  const labelFor = (option) => t(option.labelKey, option.label);

  const matchingGroups = useMemo(
    () => filterCategoryGroups(categoryGroups, categoryQuery, labelFor),
    // `t` is included so the filter re-runs against the new labels when the
    // interface language changes mid-search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryGroups, categoryQuery, t],
  );

  // A query with no hits falls back to the full list rather than an empty
  // select, so the user is never stuck with nothing to choose from.
  const hasMatches = matchingGroups.length > 0;
  const visibleGroups = hasMatches ? matchingGroups : categoryGroups;

  const matchCount = matchingGroups.reduce(
    (total, group) => total + group.options.length,
    0,
  );

  // Filtering can hide the current selection, which would leave the closed
  // select rendering blank. It is re-added under its own heading instead.
  const selectionHidden =
    formData.protocolCategory &&
    !isKnownCategory(visibleGroups, formData.protocolCategory);

  // A re-run of an older audit can carry a category that predates this list.
  // It is appended rather than discarded so the user's saved input is never
  // silently replaced by the default option.
  const legacyCategory =
    formData.protocolCategory &&
    !isKnownCategory(categoryGroups, formData.protocolCategory)
      ? formData.protocolCategory
      : null;


  useEffect(() => {
    const storedEmail = emailStore.get();
    if (storedEmail) {
      setFormData((prev) => ({ ...prev, email: storedEmail }));
    }
  }, []);

  /**
   * "Re-run audit" from the history page hands back the original inputs.
   * They are merged into the form rather than submitted directly, so the user
   * can amend anything before spending another audit from their daily quota.
   * Files cannot be restored (they are never stored), so attachments stay
   * empty and must be re-added if needed.
   */
  useEffect(() => {
    if (!prefill) return;

    setFormData((prev) => ({
      ...prev,
      projectName: prefill.project_name ?? prev.projectName,
      tokenTicker: prefill.token_ticker ?? prev.tokenTicker,
      protocolCategory: prefill.category || prev.protocolCategory,
      liveUrl: prefill.live_url ?? prev.liveUrl,
      yieldMechanics: prefill.revenue_model ?? prev.yieldMechanics,
      whitepaperContext: prefill.docs_summary ?? prev.whitepaperContext,
    }));

    if (prefill.mode === 'crypto' || prefill.mode === 'ecommerce') {
      setAuditMode(prefill.mode);
    }
  }, [prefill]);

  const handleModeChange = (mode) => {
    setAuditMode(mode);
    // The two modes have separate taxonomies, so a leftover query would filter
    // the new list against terms that no longer apply.
    setCategoryQuery('');
    setFormData((prev) => ({
      ...prev,
      protocolCategory: defaultCategoryForMode(mode),
      tokenTicker: mode === 'crypto' ? prev.tokenTicker : '',

    }));
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setAttachments(Array.from(e.target.files || []));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Field names must match the FastAPI Form(...) parameters in /api/audit.
    const submissionData = new FormData();

    submissionData.append('project_or_platform_name', formData.projectName);
    submissionData.append('mode', auditMode);
    submissionData.append('token_ticker', formData.tokenTicker);
    submissionData.append('category', formData.protocolCategory);
    submissionData.append('revenue_model', formData.yieldMechanics);
    submissionData.append('docs_summary', formData.whitepaperContext);
    submissionData.append('live_url', formData.liveUrl || '');

    // The backend reads a repeated `files` field.
    attachments.forEach((file) => submissionData.append('files', file));

    onSubmit(submissionData);
  };

  return (
    <div className="w-full">
      <form 
        onSubmit={handleSubmit} 
        className="mx-auto w-full max-w-6xl space-y-5 rounded-lg border border-slate-200 bg-white p-4 font-sans text-slate-900 shadow-lg transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:shadow-xl sm:p-6 lg:p-8"
      >
        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1.5 transition-colors duration-200 dark:border-slate-800 dark:bg-slate-950">
          <button
            type="button"
            onClick={() => handleModeChange('crypto')}
            className={`flex min-h-12 min-w-0 items-center justify-center rounded-md px-2 py-2 text-xs font-bold transition cursor-pointer ${
              auditMode === 'crypto'
                ? 'bg-[#f7931a] text-slate-950 shadow-xl shadow-[#f7931a]/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {/* Icons live outside the translated string so every locale keeps
                the same visual marker on both tabs. */}
            <span className="inline-flex min-w-0 items-center justify-center gap-1.5 text-center leading-4 sm:gap-2">
              <span aria-hidden="true" className="text-base leading-none">₿</span>
              <span className="break-words">{t('crypto_audit_btn', 'Crypto & DeFi Audit')}</span>
            </span>

          </button>
          <button
            type="button"
            onClick={() => handleModeChange('ecommerce')}
            className={`flex min-h-12 min-w-0 items-center justify-center rounded-md px-2 py-2 text-xs font-bold transition cursor-pointer ${
              auditMode === 'ecommerce'
                ? 'bg-indigo-600 text-slate-100 shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span className="inline-flex min-w-0 items-center justify-center gap-1.5 text-center leading-4 sm:gap-2">
              <span aria-hidden="true" className="text-base leading-none">🛒</span>
              <span className="break-words">{t('ecommerce_audit_btn', 'E-Commerce & Freelance Audit')}</span>
            </span>
          </button>

        </div>

        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 pt-1">
          {auditMode === 'crypto' 
            ? t('crypto_title', 'Protocol Intake Form') 
            : t('ecommerce_title', 'Gig Economy & Platform Compliance Intake')}
        </h2>

        {/* Row 1: Project Name & Token Ticker / Live URL */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label 
              htmlFor="projectName"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1"
            >
              {auditMode === 'crypto' 
                ? t('project_name', 'Project Name *') 
                : t('platform_name', 'Platform / Venture Name *')}
            </label>
            <input
              id="projectName"
              type="text"
              name="projectName"
              value={formData.projectName}
              onChange={handleChange}
              required
              placeholder={auditMode === 'crypto' 
                ? t('project_name_placeholder', 'e.g. Uniswap') 
                : t('platform_name_placeholder', 'e.g. Upwork, Fiverr, Shopify')}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 placeholder-slate-400 transition-colors duration-200 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500"
            />
          </div>

          {auditMode === 'crypto' ? (
            <div>
              <label 
                htmlFor='tokenTicker'
                className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {t('token_ticker', 'Token Ticker')}

              </label>
              <input
                id="tokenTicker"
                type="text"
                name="tokenTicker"
                value={formData.tokenTicker}
                onChange={handleChange}
                placeholder={t('token_ticker_placeholder', 'e.g. UNI')}
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm text-slate-900 placeholder-slate-400 transition-colors duration-200 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </div>
          ) : (
            <div>
              <label 
                htmlFor="liveUrl"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex justify-between">
                <span>{t('live_url', 'Live Terms / Policy URL')}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">{t('optional_scraper', 'Optional Live Scraper')}</span>
              </label>
              <input
                id="liveUrl"
                type="url"
                name="liveUrl"
                value={formData.liveUrl}
                onChange={handleChange}
                placeholder={t('live_url_placeholder', 'https://www.upwork.com/legal#terms')}
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 placeholder-slate-400 transition-colors duration-200 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </div>
          )}
        </div>

        {/* Row 2: Protocol Category / Business Model */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label 
              htmlFor="protocolCategory"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {auditMode === 'crypto' 
                ? t('protocol_category', 'Protocol Category *') 
                : t('business_model', 'Business Model / Industry *')}
            </label>
            <select
              id="protocolCategory"
              name="protocolCategory"
              value={formData.protocolCategory}
              onChange={handleChange}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 transition-colors duration-200 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 cursor-pointer"
            >
              {selectionHidden && (
                <optgroup
                  label={t('catgrp_selected', 'Current selection')}
                  className="dark:bg-slate-900"
                >
                  <option value={formData.protocolCategory}>
                    {formData.protocolCategory}
                  </option>
                </optgroup>
              )}
              {visibleGroups.map((group) => (
                <optgroup
                  key={group.id}
                  label={t(group.labelKey, group.label)}
                  className="dark:bg-slate-900"
                >
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey, option.label)}
                    </option>
                  ))}
                </optgroup>
              ))}
              {legacyCategory && !selectionHidden && (
                <option value={legacyCategory}>{legacyCategory}</option>
              )}
            </select>
            {categoryQuery.trim() && (
              <p
                aria-live="polite"
                className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5"
              >
                {hasMatches
                  ? t('category_search_results', {
                      count: matchCount,
                      defaultValue: '{{count}} matching option(s)',
                    })
                  : t(
                      'category_search_no_results',
                      'No matches — showing every option.',
                    )}
              </p>
            )}
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
              {auditMode === 'crypto'

                ? t(
                    'protocol_category_hint',
                    'Pick the closest match — choose "Other / Hybrid Protocol" and describe the mechanics below if nothing fits.',
                  )
                : t(
                    'business_model_hint',
                    'Pick the closest match — choose "Other / Hybrid Model" and describe the mechanics below if nothing fits.',
                  )}
            </p>
          </div>
        </div>


        {/* Row 3: Yield / Revenue Mechanics */}
        <div>
          <label 
            htmlFor="yieldMechanics"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            {auditMode === 'crypto' 
              ? t('yield_mechanics_label', 'Yield / Revenue Mechanics *') 
              : t('fee_structure_label', 'Fee Structure & Contract Mechanics (Optional)')}
          </label>
          <textarea
            id="yieldMechanics"
            name="yieldMechanics"
            value={formData.yieldMechanics}
            onChange={handleChange}
            required={auditMode === 'crypto'}
            rows={3}
            placeholder={
              auditMode === 'crypto'
                ? t('yield_placeholder', 'Describe how protocol revenue is generated (e.g. trading fees, interest rates, staking rewards)')
                : t('fee_placeholder', 'Describe service cut percentages, non-circumvention clauses, payout schedules...')
            }
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 placeholder-slate-400 dark:placeholder-slate-500 resize-none transition-colors duration-200"
          />
        </div>

        {/* Row 4: File Upload Container */}
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-lg transition-colors duration-200">
          <label 
            htmlFor="fileUpload"
            className="block text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
            {auditMode === 'crypto' 
              ? t('upload_whitepaper', 'Upload Whitepaper (PDF)') 
              : t('upload_terms', 'Upload Platform Terms/Policy (PDF)')}
          </label>
          <input
            id="fileUpload"
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
            onChange={handleFileChange}
            className="block min-h-11 w-full min-w-0 overflow-hidden text-xs text-slate-600 file:me-2 file:min-h-10 file:max-w-full file:rounded-md file:border-0 file:bg-emerald-100 file:px-3 file:text-xs file:font-semibold file:text-emerald-700 hover:file:bg-emerald-200 dark:text-slate-400 dark:file:bg-emerald-950 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900 cursor-pointer transition-colors duration-200"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
            {t('upload_hint', 'PDF, Word, text or images (diagrams/screenshots). Up to 5 files, 10 MB each.')}
          </p>
          {attachments.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {attachments.map((file) => (
                <li key={file.name} className="break-all text-[10px] text-slate-500 dark:text-slate-400">
                  📎 {file.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Row 5: Paste Documentation Textarea */}
        <div>
          <label 
            htmlFor="whitepaperContext"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            {auditMode === 'crypto' 
              ? t('paste_whitepaper_label', 'Or Paste Documentation Summary') 
              : t('paste_terms_label', 'Or Paste Platform Terms / Policy Text')}
          </label>
          <textarea
            id="whitepaperContext"
            name="whitepaperContext"
            value={formData.whitepaperContext}
            onChange={handleChange}
            rows={3}
            placeholder={
              auditMode === 'crypto'
                ? t('paste_whitepaper_placeholder', 'Paste relevant excerpts, smart contract logic notes, or governance structure...')
                : t('paste_terms_placeholder', 'Directly copy & paste text paragraphs or platform policies...')
            }
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 placeholder-slate-400 dark:placeholder-slate-500 resize-none transition-colors duration-200"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-3 py-3 text-center text-xs font-bold leading-5 shadow-md transition cursor-pointer ${
            auditMode === 'crypto'
              ? 'bg-amber-500 hover:bg-amber-400 disabled:bg-amber-900 text-slate-950'
              : 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white'
          }`}
        >
          {isLoading ? (
            <>
              <span className="animate-spin text-base">⚙️</span>
              {t('analyzing', 'Analyzing Shariah Risk...')}
            </>
          ) : auditMode === 'crypto' ? (
            t('submit_crypto', 'Generate Crypto Shariah Compliance Audit →')
          ) : (
            t('submit_ecommerce', 'Generate E-Commerce Shariah Compliance Audit →')
          )}
        </button>
      </form>
    </div>
  );
}