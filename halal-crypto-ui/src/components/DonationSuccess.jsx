import React, { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';

export default function DonationSuccess({ isOpen, onClose, donation }) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl text-center px-6 py-8 focus:outline-none"
          >
            {/* Animated gift icon */}
            <motion.div
              initial={{ scale: 0.4, opacity: 0, rotate: -15 }}
              animate={{
                scale: 1,
                opacity: 1,
                rotate: 0,
                transition: {
                  type: 'spring',
                  stiffness: 300,
                  damping: 18,
                  delay: 0.1,
                },
              }}
              className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-orange-100 dark:from-emerald-950/60 dark:to-orange-950/60 border-2 border-emerald-200 dark:border-emerald-800/60 text-4xl shadow-lg"
              aria-hidden="true"
            >
              <motion.span
                animate={{
                  scale: [1, 1.15, 1],
                  transition: {
                    repeat: Number.POSITIVE_INFINITY,
                    duration: 2,
                    ease: 'easeInOut',
                  },
                }}
              >
                ❤️
              </motion.span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-3"
            >
              <h2
                id={titleId}
                className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight"
              >
                {t('donation_success_title', 'Jazakallahu Khayran')}
              </h2>

              <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
                {t(
                  'donation_success_subtitle',
                  'Thank you for supporting Mizaan.',
                )}
              </p>

              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {t(
                  'donation_success_body',
                  'Your generosity helps us keep AI auditing free for everyone.',
                )}
              </p>

              {/* Donation summary */}
              {donation && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 px-4 py-3"
                >
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    {t('donation_success_gift_label', 'Your gift')}
                  </p>
                  <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                    ${donation.amount}
                    <span className="mx-2 font-normal text-emerald-500 dark:text-emerald-600">·</span>
                    <span className="text-base">{donation.methodLabel}</span>
                  </p>
                </motion.div>
              )}

              {/* Key reassurance */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-4 py-3 text-center">
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {t(
                    'donation_success_note',
                    'Mizaan remains free for everyone. Your gift never unlocks additional features — it keeps the research running.',
                  )}
                </p>
              </div>
            </motion.div>

            <motion.button
              type="button"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 px-4 py-3 text-sm font-bold text-white shadow-sm transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              {t('donation_success_close', 'Continue using Mizaan')}
            </motion.button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
