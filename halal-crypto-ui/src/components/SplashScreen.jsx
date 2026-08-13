import React, { useEffect, useState } from 'react';
import MizanAILogo from './MizanAILogo';
import { BRAND } from '../config/about';

/**
 * Initial load splash.
 *
 * Two-phase teardown: after HOLD_MS the overlay starts fading, and it unmounts
 * only once the fade has finished (FADE_MS later). Unmounting immediately at
 * the hold mark would make the splash disappear rather than dissolve.
 *
 * The overlay sits above the app and is removed from the tree entirely once
 * done, so it never intercepts clicks. `aria-hidden` keeps it out of the
 * accessibility tree — it is decorative, and screen-reader users should land on
 * the real application content, not on a loading graphic.
 *
 * Honours prefers-reduced-motion by skipping the animation and the hold
 * altogether: users who ask for reduced motion get the app immediately rather
 * than a slower, gentler animation.
 */

const HOLD_MS = 1100;
const FADE_MS = 400;

export default function SplashScreen({ onDone }) {
  const [isFading, setIsFading] = useState(false);
  const [isGone, setIsGone] = useState(false);

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setIsGone(true);
      onDone?.();
      return undefined;
    }

    const fadeTimer = setTimeout(() => setIsFading(true), HOLD_MS);
    const doneTimer = setTimeout(() => {
      setIsGone(true);
      onDone?.();
    }, HOLD_MS + FADE_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  if (isGone) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white transition-opacity duration-[400ms] ease-out ${
        isFading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <MizanAILogo className="h-16 w-16" />

      <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900">
        {BRAND.name}
      </h1>
      <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
        {BRAND.tagline}
      </p>

      {/* Indeterminate progress: a single arc rotating inside a faint ring. */}
      <div className="mt-8 h-6 w-6">
        <div className="h-full w-full animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
      </div>
    </div>
  );
}
