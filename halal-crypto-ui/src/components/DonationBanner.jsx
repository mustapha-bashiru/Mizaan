import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useDonation } from '../context/donationState';

/** Small pill used for the "no strings attached" reassurances. */
function TrustBadge({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800/70 bg-white/70 dark:bg-slate-900/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
      <span className="text-emerald-500" aria-hidden="true">✓</span>
      {children}
    </span>
  );
}

/**
 * Dismissible invitation to support the project.
 *
 * Dismissing this only hides the reminder - the permanent Donate button in the
 * header / sidebar stays available, so support is never more than one click
 * away and the modal state is shared via DonationContext.
 */
export default function DonationBanner() {
  const { t } = useTranslation();
  const { info, isBannerVisible, openDonation, dismissBanner } = useDonation();

  if (!isBannerVisible) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-labelledby="donation-card-title"
      className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50 via-white to-orange-50/60 dark:from-emerald-950/40 dark:via-slate-900 dark:to-orange-950/20 p-5 sm:p-6 shadow-sm"
    >
      {/* Decorative glow — purely visual */}
      <div
        className="pointer-events-none absolute -top-16 ltr:-right-16 rtl:-left-16 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl"
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={dismissBanner}
        aria-label={t('dismiss', 'Dismiss')}
        className="absolute top-3 ltr:right-3 rtl:left-3 z-10 rounded-lg p-1 text-emerald-500/70 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition cursor-pointer"
      >
        ✕
      </button>

      <div className="relative flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
        {/* Icon */}
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-white dark:bg-slate-900 text-xl shadow-sm">
          <span aria-hidden="true">🌿</span>
        </div>

        <div className="min-w-0 flex-1 ltr:pr-6 rtl:pl-6">
          <h2
            id="donation-card-title"
            className="flex flex-wrap items-center gap-2 text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white"
          >
            <span aria-hidden="true">❤️</span>
            {t('donation_card_title', 'Support the Mizaan Research Project')}
            <span className="rounded-md bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {t('donation_sadaqah_tag', 'Sadaqah')}
            </span>
          </h2>

          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {t(
              'donation_card_body',
              'Mizaan is free for everyone. Your voluntary Sadaqah helps us maintain AI infrastructure, improve research, and keep Shariah compliance tools freely accessible. Donations are optional and never unlock additional features.',
            )}
          </p>

          {/* Backend-configured note, when provided */}
          {info?.note && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">
              {info.note}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <TrustBadge>{t('donation_badge_optional', '100% Optional')}</TrustBadge>
            <TrustBadge>{t('donation_badge_no_subscription', 'No subscription')}</TrustBadge>
            <TrustBadge>{t('donation_badge_no_paywall', 'No paywall')}</TrustBadge>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <motion.button
              type="button"
              onClick={openDonation}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-400 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:from-orange-600 hover:to-orange-500 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              <span aria-hidden="true">❤️</span>
              {t('donate', 'Donate')}
            </motion.button>

            <button
              type="button"
              onClick={dismissBanner}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition cursor-pointer sm:ltr:ml-1 sm:rtl:mr-1"
            >
              {t('donation_hide_prompt', "Don't show this again")}
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
