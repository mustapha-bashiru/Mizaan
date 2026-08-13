import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, authApi, emailStore, tokenStore } from '../api/client';
import PasswordInput from './PasswordInput';

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const { t } = useTranslation();

  const [mode, setMode] = useState('login'); // login | register | verify
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Set when the backend rejects a signup with 409 so the modal can offer the
  // right next step (log in / reset password) instead of a red dead end.
  const [conflict, setConflict] = useState(null);

  if (!isOpen) return null;

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
    setConflict(null);
  };

  const finishLogin = (accessToken) => {
    tokenStore.set(accessToken);
    emailStore.set(email.trim().toLowerCase());
    onLoginSuccess?.();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    setConflict(null);

    try {
      if (mode === 'login') {
        // The backend expects JSON {email, password}.
        const data = await authApi.login(email.trim(), password);
        finishLogin(data.access_token);
      } else if (mode === 'register') {
        const data = await authApi.register(email.trim(), password);
        switchMode('verify');
        setNotice(
          data?.email_delivered === false
            ? t(
                'otp_console_notice',
                'Email delivery is not configured on the server, so the code was logged to the backend console.',
              )
            : t('otp_sent', 'We sent a 6-digit verification code to your inbox.'),
        );
      } else {
        // Verification returns a token, so the user lands signed in.
        const data = await authApi.verifyOtp(email.trim(), otp.trim());
        setOtp('');
        finishLogin(data.access_token);
      }
    } catch (err) {
      // An unverified account gets routed straight to the OTP step.
      if (err instanceof ApiError && err.status === 403 && mode === 'login') {
        switchMode('verify');
        setNotice(t('verify_required', 'Please verify your email to continue.'));
      } else if (err instanceof ApiError && err.status === 409) {
        // Duplicate email. The account is untouched; guide the user onwards
        // rather than showing a generic failure.
        if (err.code === 'email_exists_unverified') {
          setMode('verify');
          setError('');
          setConflict(null);
          setNotice(
            t(
              'email_exists_unverified',
              'This email has already been registered but not verified. Please verify your email or request a new OTP.',
            ),
          );
        } else {
          setConflict('verified');
          setError(
            t(
              'email_exists_verified',
              'An account with this email already exists. Please log in or use the Forgot Password option.',
            ),
          );
        }
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    setConflict(null);
    try {
      await authApi.resendOtp(email.trim());
      setNotice(t('otp_resent', 'If that account exists, a new code has been sent.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'login'
      ? t('login_title', 'Login to Mizaan')
      : mode === 'register'
        ? t('register_title', 'Create Your Account')
        : t('verify_title', 'Verify Your Email');

  const submitLabel = loading
    ? t('please_wait', 'Please wait...')
    : mode === 'login'
      ? t('login', 'Login')
      : mode === 'register'
        ? t('create_account', 'Create Account')
        : t('verify_email', 'Verify Email');

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl w-full max-w-sm shadow-2xl relative border border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
          {title}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {t('free_forever', 'Free to use — no subscription required.')}
        </p>

        {error && (
          <div
            role="alert"
            className={`mb-3 p-2.5 text-sm rounded-lg ${
              conflict
                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900'
                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
            }`}
          >
            <p>{error}</p>

            {conflict === 'verified' && (
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  {t('login', 'Login')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `/reset-password?email=${encodeURIComponent(email.trim())}`;
                  }}
                  className="font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  {t('forgot_password', 'Forgot password?')}
                </button>
              </div>
            )}
          </div>
        )}

        {notice && (
          <div className="mb-3 p-2.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-sm rounded-lg">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'verify' ? (
            <div>
              <label htmlFor="auth-otp" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('verification_code', 'Verification Code')}
              </label>
              <input
                id="auth-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 tracking-[8px] text-center text-xl text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:border-emerald-500"
              />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {t('otp_sent_to', 'Enter the 6-digit code sent to')} <strong>{email}</strong>.
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
              >
                {t('resend_code', 'Resend code')}
              </button>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('user_email', 'Email Address')}
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-md shadow-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Same validation contract as before: required always, and an
                  8-character minimum only when registering. */}
              <PasswordInput
                id="auth-password"
                label={t('password', 'Password')}
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint={
                  mode === 'register'
                    ? t('password_hint', 'At least 8 characters.')
                    : undefined
                }
              />
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-md shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed transition focus:outline-none"
          >
            {submitLabel}
          </button>
        </form>

        {mode === 'login' && (
          <div className="mt-3 text-center">
            <button type="button" onClick={() => { window.location.href = `/reset-password?email=${encodeURIComponent(email)}`; }} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
              {t('forgot_password', 'Forgot password?')}
            </button>
          </div>
        )}

        <div className="mt-4 text-center text-sm">
          {mode === 'login' && (
            <button type="button" onClick={() => switchMode('register')} className="text-emerald-600 dark:text-emerald-400 hover:underline">
              {t('need_account', 'Need an account? Register')}
            </button>
          )}
          {mode !== 'login' && (
            <button type="button" onClick={() => switchMode('login')} className="text-emerald-600 dark:text-emerald-400 hover:underline">
              {t('back_to_login', 'Back to Login')}
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          aria-label={t('close', 'Close')}
          className="absolute top-3 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
