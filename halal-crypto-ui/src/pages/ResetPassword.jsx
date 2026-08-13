import React, { useState } from 'react';
// No react-router used here; rely on native URL APIs so the app has no extra dependency.
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../api/client';

export default function ResetPassword() {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const initialEmail = params.get('email') || '';
  const token = params.get('token') || '';

  // If `token` is present we render the confirm form. Otherwise we render
  // a request form to send the reset email.
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Set once the reset email request succeeds, which swaps the form for a
  // confirmation screen rather than leaving the page looking untouched.
  const [requestSent, setRequestSent] = useState(false);


  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError(t('passwords_mismatch', 'Passwords do not match'));
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, new_password: password }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || 'Reset failed');
      }
      setNotice(t('password_reset_success', 'Your password was reset. You can now log in.'));
      setTimeout(() => { window.location.href = '/?showLogin=1&resetSuccess=1'; }, 1200);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) return setError(t('invalid_email', 'Please enter a valid email'));
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || 'Request failed');
      }
      // Swap the form out for a confirmation screen. The wording is identical
      // for existing and unknown addresses, so the confirmation never reveals
      // whether an account exists.
      setRequestSent(true);

    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  // Confirmation screen. Returned early so the form, heading and instructions
  // are all replaced — the previous behaviour left the form in place with only
  // a small inline notice, which read as though nothing had happened.
  if (requestSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-lg text-center">
          <div
            aria-hidden="true"
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40"
          >
            <svg
              className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>

          {/* role=status announces the outcome to screen readers, which would
              otherwise get no notification of the swapped content. */}
          <h2
            role="status"
            className="mt-5 text-xl font-bold text-slate-900 dark:text-white"
          >
            {t('reset_sent_title', 'Password Reset Email Sent')}
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {t(
              'reset_sent_body',
              'We have sent a password reset link to your email address.',
            )}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {t(
              'reset_sent_spam',
              'Please check your inbox, and your spam folder if necessary.',
            )}
          </p>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {t(
              'reset_sent_expiry',
              'The reset link will expire after a limited time.',
            )}
          </p>

          <a
            href="/?showLogin=1"
            className="mt-7 inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            {t('back_to_login', 'Return to Login')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-lg">
        <h2 className="text-xl font-bold mb-2">{t('reset_password_title', 'Reset your password')}</h2>

        <p className="text-sm text-slate-500 mb-4">{t('reset_password_instructions', 'Choose a new password for your account, or request a reset email.')}</p>

        {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}
        {notice && <div className="mb-3 text-sm text-emerald-600">{notice}</div>}

        {token ? (
          <form onSubmit={handleConfirm} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">{t('email', 'Email')}</label>
              <input readOnly value={email} className="mt-1 block w-full bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-md" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">{t('new_password', 'New password')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="mt-1 block w-full px-3 py-2 rounded-md" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">{t('confirm_password', 'Confirm password')}</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className="mt-1 block w-full px-3 py-2 rounded-md" />
            </div>

            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-md bg-emerald-600 text-white font-bold">{loading ? t('please_wait', 'Please wait...') : t('reset_password_button', 'Reset password')}</button>
          </form>
        ) : (
          <form onSubmit={handleRequest} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">{t('email', 'Email')}</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 block w-full px-3 py-2 rounded-md" />
            </div>

            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-md bg-emerald-600 text-white font-bold">{loading ? t('please_wait', 'Please wait...') : t('send_reset_email', 'Send reset email')}</button>
          </form>
        )}
      </div>
    </div>
  );
}
