import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MizanBrandHeader from '../components/MizanBrandHeader';
import ShariahReportViewer from '../components/ShariahReportViewer';
import { publicReportsApi } from '../api/client';

/**
 * The page a share link resolves to.
 *
 * Recipients are not Mizaan users, so this renders without a session and
 * without the owner's tools: the share token grants sight of one report and
 * nothing else. The report itself is rendered by the same viewer the owner
 * sees, in read-only mode, so a shared audit can never drift from the original.
 */
export default function SharedReport({ token }) {
  const { t } = useTranslation();

  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | missing

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await publicReportsApi.get(token);
        if (cancelled) return;
        setReport(data?.report || null);
        setStatus(data?.report ? 'ready' : 'missing');
      } catch (err) {
        // A bad token and a deleted audit are both 404s, and the distinction is
        // deliberately not surfaced: it would confirm which links ever existed.
        if (!cancelled) {
          console.error('Shared report error:', err);
          setStatus('missing');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <MizanBrandHeader />
          <a
            href="/"
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition shrink-0"
          >
            {t('run_your_own_audit', 'Run your own audit')}
          </a>
        </div>
      </header>

      <main className="px-4 py-8">
        {status === 'loading' && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 animate-pulse">
            {t('loading_report', 'Loading audit report...')}
          </p>
        )}

        {status === 'missing' && (
          <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-xl space-y-3">
            <p className="text-3xl">🔍</p>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('shared_report_unavailable', 'This report is no longer available')}
            </h1>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {t(
                'shared_report_unavailable_hint',
                'The link may be incorrect, or the report may have been removed by its owner.',
              )}
            </p>
          </div>
        )}

        {status === 'ready' && (
          <>
            <ShariahReportViewer report={report} readOnly />

            <p className="max-w-5xl mx-auto mt-6 text-center text-[11px] text-slate-500 dark:text-slate-400">
              {t(
                'shared_report_footer',
                'Shared from Mizaan AI. This report is informational and is not a fatwa.',
              )}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
