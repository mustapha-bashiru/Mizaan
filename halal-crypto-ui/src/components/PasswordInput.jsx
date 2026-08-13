import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Password field with an accessible show/hide toggle.
 *
 * Accessibility notes:
 *  - The toggle is a real <button type="button"> so it never submits the form
 *    and is reachable by keyboard without a custom key handler.
 *  - `aria-pressed` communicates the toggle state; `aria-controls` ties it to
 *    the input it governs.
 *  - The visibility change is also announced through a visually hidden live
 *    region, because a sighted-only icon swap tells a screen reader nothing.
 *  - The icon is `aria-hidden` so the button's label is not read twice.
 *
 * Validation is untouched: `required`, `minLength` and `autoComplete` are
 * forwarded straight to the native input, so browser validation still applies.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  label,
  required = false,
  minLength,
  autoComplete = 'current-password',
  hint,
  disabled = false,
  className = '',
  ...rest
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const generatedId = useId();
  const inputId = id || `password-${generatedId}`;
  const statusId = `${inputId}-visibility-status`;
  const hintId = hint ? `${inputId}-hint` : undefined;

  const showLabel = t('show_password', 'Show password');
  const hideLabel = t('hide_password', 'Hide password');

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
      )}

      <div className="relative mt-1">
        <input
          id={inputId}
          // Switching the type is what actually reveals the value.
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          disabled={disabled}
          value={value}
          onChange={onChange}
          aria-describedby={[hintId, statusId].filter(Boolean).join(' ') || undefined}
          // pr-11 reserves room so long values never slide under the icon.
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-11 text-slate-900 shadow-sm transition-colors duration-200 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          {...rest}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          aria-controls={inputId}
          // Generous hit area: 44px tall target for comfortable tapping on mobile.
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition-colors duration-200 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <EyeIcon crossed={visible} />
        </button>
      </div>

      {/* Screen-reader-only announcement of the current state. */}
      <span id={statusId} className="sr-only" role="status" aria-live="polite">
        {visible
          ? t('password_shown', 'Password is visible')
          : t('password_hidden', 'Password is hidden')}
      </span>

      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Single eye glyph whose slash animates in/out, so the two states feel like
 * one object changing rather than two icons swapping.
 */
function EyeIcon({ crossed }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        className="transition-opacity duration-200"
        style={{ opacity: crossed ? 0.55 : 1 }}
      />
      <circle
        cx="12"
        cy="12"
        r="3.25"
        className="origin-center transition-transform duration-200"
        style={{ transform: crossed ? 'scale(0.75)' : 'scale(1)' }}
      />
      {/* The slash is always rendered and animates its length, which is far
          smoother than mounting/unmounting a second icon. */}
      <line
        x1="4"
        y1="20"
        x2="20"
        y2="4"
        pathLength="1"
        strokeDasharray="1"
        className="transition-all duration-300 ease-out"
        style={{ strokeDashoffset: crossed ? 0 : 1 }}
      />
    </svg>
  );
}
