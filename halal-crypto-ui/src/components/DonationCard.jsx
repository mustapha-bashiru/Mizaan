import React from 'react';
import { motion } from 'framer-motion';

/**
 * Selectable payment-method card used inside the donation modal.
 *
 * Rendered as a real <button> with aria-pressed so keyboard and screen reader
 * users get the same selection semantics as pointer users.
 */
export default function DonationCard({
  method,
  label,
  hint,
  selected = false,
  onSelect,
  disabled = false,
  comingSoonLabel,
}) {
  return (
    <motion.button
      type="button"
      onClick={() => !disabled && onSelect?.(method.id)}
      aria-pressed={selected}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-200/80 text-slate-400 opacity-70 grayscale dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-500'
          : selected
            ? 'cursor-pointer border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 shadow-sm'
            : 'cursor-pointer border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/40 hover:border-emerald-400 dark:hover:border-emerald-600'
      }`}
    >
      {selected && (
        <motion.span
          layout
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute top-1.5 ltr:right-1.5 rtl:left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white"
          aria-hidden="true"
        >
          ✓
        </motion.span>
      )}

      <span
        className={`text-xl leading-none ${
          selected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
        }`}
        aria-hidden="true"
      >
        {method.symbol}
      </span>

      <span
        className={`text-xs font-bold ${
          disabled
            ? 'text-slate-400 dark:text-slate-500'
            : selected
              ? 'text-emerald-800 dark:text-emerald-300'
              : 'text-slate-700 dark:text-slate-300'
        }`}
      >
        {label}
      </span>

      {hint && (
        <span className={`text-[10px] leading-tight ${disabled ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400 dark:text-slate-500'}`}>
          {hint}
        </span>
      )}

      {disabled && comingSoonLabel && (
        <span className="mt-0.5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {comingSoonLabel}
        </span>
      )}
    </motion.button>
  );
}
