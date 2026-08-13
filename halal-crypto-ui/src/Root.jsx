import React, { Suspense, useState } from 'react';
import App from './App.jsx';
import ResetPassword from './pages/ResetPassword';
import SharedReport from './pages/SharedReport';
import SplashScreen from './components/SplashScreen';

/**
 * Application root: decides which top-level page renders and owns the boot
 * overlay.
 *
 * The splash is mounted alongside the app rather than in place of it, so React
 * mounts and initialises the real UI (i18n, theme, session) behind the overlay.
 * By the time the splash fades, the app underneath is already interactive —
 * this is a brand moment layered over real startup work, not an artificial wait.
 *
 * Kept out of main.jsx so the entry file stays pure bootstrap; co-locating a
 * component there breaks React Fast Refresh for the module.
 */
export default function Root() {
  const [isBooting, setIsBooting] = useState(true);

  // Password reset arrives as a real URL (from the emailed link) rather than
  // through in-app navigation, so it is resolved here from the pathname.
  const isResetPassword =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/reset-password');

  // Shared reports arrive the same way, from a link pasted into a chat.
  const shareToken =
    typeof window !== 'undefined'
      ? window.location.pathname.match(/^\/reports\/([^/?#]+)/)?.[1]
      : undefined;

  // A recipient opening a shared link is not signing in, so the boot splash is
  // skipped for that page: it would delay content they came straight to read.
  if (shareToken) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
        <SharedReport token={decodeURIComponent(shareToken)} />
      </Suspense>
    );
  }

  return (
    <>
      {isBooting && <SplashScreen onDone={() => setIsBooting(false)} />}

      {/* The Suspense fallback matches the splash background so a lazy i18n
          load cannot flash a different colour between the two. */}
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
        {isResetPassword ? <ResetPassword /> : <App />}
      </Suspense>
    </>
  );
}
