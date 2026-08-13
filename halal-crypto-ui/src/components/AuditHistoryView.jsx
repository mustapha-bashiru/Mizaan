import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, historyApi } from '../api/client';

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { value: 'newest', labelKey: 'sort_newest', fallback: 'Newest first' },
  { value: 'oldest', labelKey: 'sort_oldest', fallback: 'Oldest first' },
  { value: 'score_desc', labelKey: 'sort_score_desc', fallback: 'Highest risk' },
  { value: 'score_asc', labelKey: 'sort_score_asc', fallback: 'Lowest risk' },
  { value: 'name', labelKey: 'sort_name', fallback: 'Project name (A–Z)' },
];

const EMPTY_FILTERS = {
  search: '',
  date_from: '',
  date_to: '',
  min_score: '',
  max_score: '',
  sort: 'newest',
};

/** Mirrors the backend risk bands so colours agree across PDF, UI and API. */
function riskStyles(score) {
  if (score === null || score === undefined) {
    return 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300';
  }
  if (score <= 20) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300';
  }
  if (score <= 40) {
    return 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300';
  }
  if (score <= 70) {
    return 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950/50 dark:text-orange-300';
  }
  return 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/50 dark:text-rose-300';
}

function formatDate(iso) {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AuditHistoryView({ onViewReport, onRerunAudit }) {
  const { t } = useTranslation();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Debounced copy of the free-text search, so typing does not fire a request
  // per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState({ items: [], total: 0, has_more: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [toast, setToast] = useState('');

  // Guards against a slow earlier response overwriting a newer one.
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');

    try {
      const result = await historyApi.list({
        search: debouncedSearch,
        date_from: filters.date_from,
        date_to: filters.date_to,
        min_score: filters.min_score,
        max_score: filters.max_score,
        sort: filters.sort,
        page,
        page_size: PAGE_SIZE,
      });
      if (requestId === requestRef.current) {
        setData(result);
      }
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(
          err instanceof ApiError
            ? err.message
            : t('history_load_failed', 'Could not load your audit history.'),
        );
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [
    debouncedSearch,
    filters.date_from,
    filters.date_to,
    filters.min_score,
    filters.max_score,
    filters.sort,
    page,
    t,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key !== 'search') setPage(1);
  };

  const handleDownload = async (item) => {
    setBusyId(item.id);
    setError('');
    try {
      await historyApi.downloadPdf(item.id, `Mizaan-Audit-${item.project_name}.pdf`);
      setToast(t('download_started', 'Download started.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item) => {
    setBusyId(item.id);
    setError('');
    try {
      await historyApi.remove(item.id);
      setConfirmId(null);
      setToast(t('audit_deleted', 'Audit deleted.'));

      // Stepping back a page avoids stranding the user on an empty last page.
      if (data.items.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        load();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRerun = async (item) => {
    setBusyId(item.id);
    setError('');
    try {
      const context = await historyApi.rerunContext(item.id);
      onRerunAudit?.(context);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleView = async (item) => {
    setBusyId(item.id);
    setError('');
    try {
      const detail = await historyApi.get(item.id);
      onViewReport?.(detail.report, detail.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const hasFilters =
    debouncedSearch ||
    filters.date_from ||
    filters.date_to ||
    filters.min_score ||
    filters.max_score;

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <ClockIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          {t('audit_history', 'Audit History')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {t(
            'audit_history_subtitle',
            'Every completed audit is saved privately to your account.',
          )}
        </p>
      </header>

      {/* Filters */}
      <div className="glass card-surface mb-6 rounded-2xl p-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            placeholder={t('search_audits', 'Search by project, classification or report ID')}
            aria-label={t('search_audits', 'Search audits')}
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('date_from', 'From')}>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => updateFilter('date_from', e.target.value)}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label={t('date_to', 'To')}>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => updateFilter('date_to', e.target.value)}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label={t('min_score', 'Min score')}>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.min_score}
              onChange={(e) => updateFilter('min_score', e.target.value)}
              placeholder="0"
              className={FIELD_CLASS}
            />
          </Field>
          <Field label={t('max_score', 'Max score')}>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.max_score}
              onChange={(e) => updateFilter('max_score', e.target.value)}
              placeholder="100"
              className={FIELD_CLASS}
            />
          </Field>
          <Field label={t('sort_by', 'Sort by')}>
            <select
              value={filters.sort}
              onChange={(e) => updateFilter('sort', e.target.value)}
              className={FIELD_CLASS}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey, option.fallback)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
            className="mt-3 text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-500 dark:text-emerald-400"
          >
            {t('clear_filters', 'Clear all filters')}
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <SkeletonList />
      ) : data.items.length === 0 ? (
        <EmptyState hasFilters={Boolean(hasFilters)} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li
              key={item.id}
              className="group animate-rise card-surface hover:card-surface-hover rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800 sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">
                      {item.project_name}
                    </h2>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${riskStyles(item.risk_score)}`}
                    >
                      {item.risk_score ?? '—'}
                      <span className="ml-1 font-normal opacity-70">
                        {t('risk', 'risk')}
                      </span>
                    </span>
                  </div>

                  <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <dt className="sr-only">{t('audit_date', 'Audit date')}</dt>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <dd>{formatDate(item.audit_date)}</dd>
                    </div>
                    {item.classification && (
                      <div className="flex items-center gap-1.5">
                        <dt className="sr-only">
                          {t('classification', 'Classification')}
                        </dt>
                        <ShieldIcon className="h-3.5 w-3.5" />
                        <dd>{item.classification}</dd>
                      </div>
                    )}
                    {item.report_type && (
                      <div className="flex items-center gap-1.5">
                        <dt className="sr-only">{t('report_type', 'Report type')}</dt>
                        <DocumentIcon className="h-3.5 w-3.5" />
                        <dd>{item.report_type}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Actions: wrap on mobile, inline on desktop. */}
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <ActionButton
                    onClick={() => handleView(item)}
                    disabled={busyId === item.id}
                    variant="primary"
                  >
                    {t('view_report', 'View')}
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleDownload(item)}
                    disabled={busyId === item.id}
                  >
                    {t('download_pdf', 'PDF')}
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleRerun(item)}
                    disabled={busyId === item.id}
                  >
                    {t('rerun_audit', 'Re-run')}
                  </ActionButton>
                  <ActionButton
                    onClick={() => setConfirmId(item.id)}
                    disabled={busyId === item.id}
                    variant="danger"
                  >
                    {t('delete', 'Delete')}
                  </ActionButton>
                </div>
              </div>

              {/* Inline confirmation avoids a modal for a low-stakes action. */}
              {confirmId === item.id && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
                  <p className="text-sm text-rose-700 dark:text-rose-300">
                    {t('delete_confirm', 'Permanently delete this audit and its PDF?')}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {t('cancel', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={busyId === item.id}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
                    >
                      {busyId === item.id
                        ? t('deleting', 'Deleting…')
                        : t('confirm_delete', 'Delete')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {!loading && data.total > PAGE_SIZE && (
        <nav
          className="mt-6 flex items-center justify-between"
          aria-label={t('pagination', 'Pagination')}
        >
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className={PAGER_CLASS}
          >
            {t('previous', 'Previous')}
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {t('page_x_of_y', 'Page {{page}} of {{total}}', {
              page,
              total: totalPages,
            })}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!data.has_more}
            className={PAGER_CLASS}
          >
            {t('next', 'Next')}
          </button>
        </nav>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="animate-rise fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900"
        >
          {toast}
        </div>
      )}
    </section>
  );
}

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

const PAGER_CLASS =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function ActionButton({ children, variant = 'default', ...props }) {
  const variants = {
    primary:
      'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500/50',
    danger:
      'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50 focus-visible:ring-rose-500/50',
    default:
      'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:ring-slate-500/50',
  };

  return (
    <button
      type="button"
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Skeletons mirror the real card layout so the swap does not shift content. */
function SkeletonList() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <li
          key={index}
          className="shimmer card-surface rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-5 w-40 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="flex gap-4">
                <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800/60" />
                <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-800/60" />
              </div>
            </div>
            <div className="hidden gap-2 sm:flex">
              {Array.from({ length: 3 }).map((__, i) => (
                <div
                  key={i}
                  className="h-8 w-16 rounded-lg bg-slate-100 dark:bg-slate-800/60"
                />
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ hasFilters }) {
  const { t } = useTranslation();

  return (
    <div className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <ClockIcon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
        {hasFilters
          ? t('no_matching_audits', 'No audits match these filters')
          : t('no_audits_yet', 'No audits yet')}
      </h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        {hasFilters
          ? t('try_adjusting_filters', 'Try widening your search or clearing the filters.')
          : t(
              'run_first_audit',
              'Run your first Shariah compliance audit and it will appear here automatically.',
            )}
      </p>
    </div>
  );
}

/* --- Icons ------------------------------------------------------------- */
const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

function ClockIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...iconProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...iconProps}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...iconProps}>
      <path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z" />
    </svg>
  );
}

function DocumentIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...iconProps}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
