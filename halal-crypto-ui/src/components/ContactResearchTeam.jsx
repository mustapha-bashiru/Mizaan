import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  RESEARCH_EMAIL,
  RESEARCH_TOPICS,
  researchMailto,
} from '../config/about';

/**
 * Contact panel for the research team.
 *
 * The primary action is a plain anchor with a mailto: href rather than a button
 * with an onClick handler. An anchor lets the browser own the handoff to the
 * mail client, and it keeps the standard affordances a scripted click would
 * throw away: middle-click, copy-address, and the URL shown on hover.
 *
 * The raw address is also rendered as selectable text, because a meaningful
 * share of users have no OS mail client registered — for them a mailto: link
 * silently does nothing, and the visible address is the only way through.
 */
export default function ContactResearchTeam() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-8">
        <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          {t('contact_research_title', 'Contact Research Team')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {t(
            'contact_research_intro',
            'Every message is reviewed by the Mizaan AI Research Team. Your reports directly shape how the audit engine evolves — especially corrections, which help us reduce false positives.',
          )}
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800/50 sm:p-8">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {t('contact_research_topics_label', 'What to send us')}
        </h3>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {RESEARCH_TOPICS.map((topic) => (
            <li
              key={topic.key}

              className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
              />
              {t(topic.key, topic.label)}

            </li>
          ))}
        </ul>

        <div className="mt-7 border-t border-slate-100 pt-6 dark:border-slate-700">
          <a
            href={researchMailto()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 sm:w-auto"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            {t('contact_research_cta', 'Email the Research Team')}
          </a>

          <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {t(
              'contact_research_fallback',
              'This opens a pre-filled draft in your default email app. If nothing happens, write to us directly at',
            )}{' '}
            <span className="select-all font-semibold text-slate-700 dark:text-slate-300">
              {RESEARCH_EMAIL}
            </span>
            .
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        {t(
          'contact_research_security_note',
          'For security concerns, please include steps to reproduce and avoid posting details publicly until we have responded.',
        )}
      </p>
    </div>
  );
}
