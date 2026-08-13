import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import DonationCard from './DonationCard';
import {
  MAX_AMOUNT,
  MIN_AMOUNT,
  PAYMENT_METHODS,
  PRESET_AMOUNTS,
  donationHandlers,
  getPaymentMethod,
  isPlaceholderAddress,
} from '../config/donation';

/** Localised label/hint for a payment method, falling back to the config text. */
function useMethodCopy() {
  const { t } = useTranslation();
  return useCallback(
    (method) => ({
      label: t(`donation_method_${method.id}`, method.label),
      hint: t(`donation_method_${method.id}_hint`, method.hint),
    }),
    [t],
  );
}

/** Compact "✓ ..." reassurance pill shown in the modal footer. */
function TrustPill({ children }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
      <span className="text-emerald-500" aria-hidden="true">✓</span>
      {children}
    </span>
  );
}

export default function DonationModal({ isOpen, onClose, onSuccess, note }) {
  const { t } = useTranslation();
  const methodCopy = useMethodCopy();
  const titleId = useId();
  const descriptionId = useId();

  const dialogRef = useRef(null);
  const copyTimeoutRef = useRef(null);

  const [selectedAmount, setSelectedAmount] = useState(PRESET_AMOUNTS[1]);
  const [customAmount, setCustomAmount] = useState('');
  const [methodId, setMethodId] = useState('usdt');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const method = getPaymentMethod(methodId);
  const isCrypto = method?.type === 'crypto';
  // Real wallets get a "verified" badge; placeholders must never claim that.
  const addressPending = isCrypto && isPlaceholderAddress(method.address);

  // A custom value always wins over the preset selection.
  const amount = useMemo(() => {
    if (customAmount.trim() !== '') {
      const parsed = Number.parseFloat(customAmount);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return selectedAmount;
  }, [customAmount, selectedAmount]);

  const amountIsValid = amount !== null && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;

  const resetState = useCallback(() => {
    setSelectedAmount(PRESET_AMOUNTS[1]);
    setCustomAmount('');
    setMethodId('usdt');
    setCopied(false);
    setSubmitting(false);
    setFormError('');
  }, []);

  // Escape to close + lock background scrolling while the dialog is open.
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  // Move focus into the dialog so keyboard users start in the right place.
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
    else resetState();
  }, [isOpen, resetState]);

  useEffect(() => () => clearTimeout(copyTimeoutRef.current), []);

  const handleSelectPreset = (value) => {
    setSelectedAmount(value);
    setCustomAmount('');
    setFormError('');
  };

  const handleCustomAmountChange = (event) => {
    // Keep digits and a single decimal separator only.
    const cleaned = event.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    setCustomAmount(cleaned);
    setFormError('');
  };

  const handleSelectMethod = (nextId) => {
    if (nextId === 'card') {
      return;
    }
    setMethodId(nextId);
    setCopied(false);
    setFormError('');
  };

  const handleCopyAddress = async () => {
    if (!method?.address) return;
    try {
      await navigator.clipboard.writeText(method.address);
      setCopied(true);
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setFormError(
        t('donation_copy_failed', 'Could not copy automatically. Please select the address and copy it manually.'),
      );
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!amountIsValid) {
      setFormError(
        t('donation_invalid_amount', 'Please enter a donation amount of at least $1.'),
      );
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      // Placeholder handlers - real providers get wired in later.
      if (isCrypto) {
        await donationHandlers.acknowledgeCryptoDonation({ amount, methodId });
      } else {
        await donationHandlers.startCardDonation({ amount });
      }
      onSuccess?.({ amount, methodId, methodLabel: methodCopy(method).label });
    } catch {
      setFormError(
        t('donation_submit_failed', 'Something went wrong. Please try again in a moment.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = submitting
    ? t('please_wait', 'Please wait...')
    : isCrypto
      ? t('donation_confirm_crypto', "I've Completed My Donation")
      : t('donation_continue_card', 'Continue to secure checkout');

  const sectionLegend =
    'text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
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
            aria-describedby={descriptionId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl focus:outline-none"
          >
            {/* Header ---------------------------------------------------- */}
            <div className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="flex flex-wrap items-center gap-2 text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight"
                  >
                    <span aria-hidden="true">❤️</span>
                    {t('donation_modal_title', 'Support Mizaan (Sadaqah)')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('close', 'Close')}
                  className="-mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Trust message, directly under the title */}
              <div
                id={descriptionId}
                className="mt-3 space-y-1.5 rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/25 px-4 py-3"
              >
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  {t('donation_trust_free', 'Mizaan will always remain free.')}
                </p>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {t(
                    'donation_trust_body',
                    'Your voluntary Sadaqah helps fund AI research, cloud infrastructure, and future improvements.',
                  )}
                </p>
                <p className="text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                  {t('donation_trust_no_premium', 'Donations never unlock premium features.')}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-7">
              {/* Amount --------------------------------------------------- */}
              <fieldset className="space-y-3">
                <legend className={sectionLegend}>
                  {t('donation_amount_label', 'Choose an amount')}
                </legend>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PRESET_AMOUNTS.map((value) => {
                    const active = customAmount.trim() === '' && selectedAmount === value;
                    return (
                      <motion.button
                        key={value}
                        type="button"
                        onClick={() => handleSelectPreset(value)}
                        aria-pressed={active}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className={`rounded-xl border py-2.5 text-sm font-bold transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                          active
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 hover:border-emerald-400 dark:hover:border-emerald-600'
                        }`}
                      >
                        ${value}
                      </motion.button>
                    );
                  })}
                </div>

                <div>
                  <label
                    htmlFor="donation-custom-amount"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    {t('donation_custom_amount', 'Or enter a custom amount')}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 ltr:left-3.5 rtl:right-3.5 flex items-center text-sm font-bold text-slate-400">
                      $
                    </span>
                    <input
                      id="donation-custom-amount"
                      type="text"
                      inputMode="decimal"
                      value={customAmount}
                      onChange={handleCustomAmountChange}
                      placeholder="100"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ltr:pl-8 rtl:pr-8 ltr:pr-4 rtl:pl-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Payment methods ----------------------------------------- */}
              <fieldset className="space-y-3">
                <legend className="w-full">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <span aria-hidden="true">🔒</span>
                    {t('donation_secure_title', 'Secure Donation')}
                  </span>
                  <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500 dark:text-slate-400">
                    {t('donation_secure_subtitle', 'Choose your preferred payment method.')}
                  </span>
                </legend>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {PAYMENT_METHODS.map((item) => {
                    const copy = methodCopy(item);
                    const isCardComingSoon = item.id === 'card';
                    return (
                      <DonationCard
                        key={item.id}
                        method={item}
                        label={copy.label}
                        hint={copy.hint}
                        selected={methodId === item.id}
                        onSelect={handleSelectMethod}
                        disabled={isCardComingSoon}
                        comingSoonLabel={t('donation_method_card_coming_soon', 'Coming Soon')}
                      />
                    );
                  })}
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200">
                  {t(
                    'donation_card_disabled_notice',
                    'Card processing is launching soon. Please use the crypto donation methods for now.',
                  )}
                </div>
              </fieldset>

              {/* Method specific panel ----------------------------------- */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={methodId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {isCrypto ? (
                    <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4">
                      {/* Network + verification badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        {method.network && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                            {method.network}
                          </span>
                        )}

                        {addressPending ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            <span aria-hidden="true">⏳</span>
                            {t('donation_wallet_pending', 'Wallet not configured')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                            <span aria-hidden="true">🛡️</span>
                            {t('donation_wallet_verified', 'Wallet verified')}
                          </span>
                        )}
                      </div>

                      {/* Network warning */}
                      {method.networkWarning && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 p-3">
                          <span className="text-sm leading-none mt-0.5" aria-hidden="true">⚠️</span>
                          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                            <strong className="font-bold">
                              {method.network
                                ? t('donation_network_label', 'Network: {{network}}', {
                                    network: method.network,
                                  })
                                : t('donation_network_generic', 'Check the network')}
                              {' — '}
                            </strong>
                            {t(`donation_network_warning_${method.id}`, method.networkWarning)}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* QR code */}
                        <div className="shrink-0 self-center sm:self-start">
                          <div
                            className="flex h-28 w-28 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-sm"
                            role="img"
                            aria-label={t('donation_qr_label', 'Donation wallet QR code')}
                          >
                            {!addressPending && method?.address ? (
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                                  method.address,
                                )}`}
                                alt={t('donation_qr_label', 'Donation wallet QR code')}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <span className="px-2 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                {t('donation_qr_soon', 'QR code coming soon')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-center text-[10px] text-slate-400 dark:text-slate-500">
                            {t('donation_qr_scan', 'Scan to pay')}
                          </p>
                        </div>

                        {/* Address + copy */}
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t('donation_wallet_address', 'Wallet address')}
                          </p>
                          <p className="break-all rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                            {method.address}
                          </p>

                          <motion.button
                            type="button"
                            onClick={handleCopyAddress}
                            whileTap={{ scale: 0.97 }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer"
                          >
                            <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
                            {copied
                              ? t('donation_copied', 'Copied')
                              : t('donation_copy_address', 'Copy address')}
                          </motion.button>

                          {addressPending && (
                            <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
                              {t(
                                'donation_placeholder_notice',
                                'Placeholder address — the project wallets are connected before launch.',
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* What happens after sending */}
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {t('donation_status_title', 'After you send')}
                        </p>
                        <ol className="space-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 ltr:pl-4 rtl:pr-4 list-decimal">
                          <li>{t('donation_status_step1', 'Send the amount to the address above on the correct network.')}</li>
                          <li>{t('donation_status_step2', 'Wait for the network to confirm the transaction.')}</li>
                          <li>{t('donation_status_step3', 'Confirm below so we can thank you — no personal data is required.')}</li>
                        </ol>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4">
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {t(
                          'donation_card_notice',
                          'Secure card donations are being connected. Card details are never entered or stored in Mizaan — you will be redirected to a trusted payment provider.',
                        )}
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Summary -------------------------------------------------- */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 px-4 py-3">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {t('donation_summary_label', 'Your Sadaqah')}
                </span>
                <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                  {amountIsValid ? `$${amount}` : '—'}
                  <span className="mx-1.5 font-normal text-emerald-500 dark:text-emerald-600">·</span>
                  {methodCopy(method).label}
                </span>
              </div>

              {/* Integrity statement */}
              <p className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {t(
                  'donation_integrity_note',
                  'Donations support ongoing research and infrastructure. They do not influence audit results or purchase favorable outcomes.',
                )}
              </p>

              {/* Backend-configured note, when provided */}
              {note && (
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {note}
                </p>
              )}

              {formError && (
                <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950/50 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                  {formError}
                </p>
              )}

              {/* Actions -------------------------------------------------- */}
              <div className="space-y-3">
                <motion.button
                  type="submit"
                  disabled={submitting || !amountIsValid}
                  whileHover={amountIsValid && !submitting ? { y: -1 } : undefined}
                  whileTap={amountIsValid && !submitting ? { scale: 0.98 } : undefined}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:from-emerald-500 hover:to-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                >
                  {submitLabel}
                </motion.button>

                {isCrypto && (
                  <p className="text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {t(
                      'donation_irreversible_note',
                      'I understand crypto transactions cannot be reversed.',
                    )}
                  </p>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition cursor-pointer"
                >
                  {t('donation_maybe_later', 'Maybe later')}
                </button>

                {/* Trust badges */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
                  <TrustPill>{t('donation_badge_no_subscription', 'No subscription')}</TrustPill>
                  <TrustPill>{t('donation_badge_no_recurring', 'No recurring charges')}</TrustPill>
                  <TrustPill>{t('donation_badge_voluntary', '100% voluntary')}</TrustPill>
                  <TrustPill>{t('donation_badge_supports_research', 'Your donation supports research')}</TrustPill>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
