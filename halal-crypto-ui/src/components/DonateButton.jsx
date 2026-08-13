import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useDonation } from '../context/donationState';

const press = { whileHover: { y: -1 }, whileTap: { scale: 0.97 } };
const spring = { type: 'spring', stiffness: 400, damping: 28 };

/**
 * Always-available Donate entry point.
 *
 * Unlike the banner this cannot be dismissed - it is the permanent, quiet way
 * to support the project. Three presentations share one behaviour:
 *
 *  - `header`  compact pill for the desktop navigation bar
 *  - `sidebar` full-width row for the mobile drawer
 *  - `fab`     floating action button for small screens
 */
export default function DonateButton({ variant = 'header', className = '', onClick }) {
  const { t } = useTranslation();
  const { donationsEnabled, openDonation } = useDonation();

  if (!donationsEnabled) return null;

  const label = t('donate', 'Donate');

  const handleClick = () => {
    onClick?.();
    openDonation();
  };

  const focusRing =
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950';

  if (variant === 'fab') {
    return (
      <motion.button
        type="button"
        onClick={handleClick}
        aria-label={label}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`md:hidden fixed bottom-5 ltr:right-5 rtl:left-5 z-30 flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-400 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/25 cursor-pointer ${focusRing} ${className}`}

      >
        <span aria-hidden="true">❤️</span>
        <span>{label}</span>
      </motion.button>
    );
  }

  if (variant === 'sidebar') {
    return (
      <motion.button
        type="button"
        onClick={handleClick}
        {...press}
        transition={spring}
        className={`flex w-full items-center gap-2 rounded-lg border border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/30 p-2.5 text-sm font-bold text-orange-700 dark:text-orange-300 transition hover:bg-orange-100 dark:hover:bg-orange-900/40 cursor-pointer ${focusRing} ${className}`}
      >
        <span aria-hidden="true">❤️</span>
        {label}
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      {...press}
      transition={spring}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-orange-300 dark:border-orange-800/70 bg-orange-50 dark:bg-orange-950/40 px-3 py-1.5 text-sm font-bold text-orange-700 dark:text-orange-300 shadow-sm transition hover:bg-orange-100 dark:hover:bg-orange-900/50 cursor-pointer ${focusRing} ${className}`}
    >
      <span aria-hidden="true">❤️</span>
      {label}
    </motion.button>
  );
}
