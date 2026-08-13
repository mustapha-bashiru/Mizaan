import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import MizanAILogo from './MizanAILogo';
import {
  BRAND,
  FOUNDER,
  VISION,
  FOUNDER_ATTRIBUTION_KEY,
  FOUNDER_ATTRIBUTION,
} from '../config/about';



/**
 * About page: what the platform is for, then who built it.
 *
 * Order is deliberate. The product case comes first and the founder profile
 * sits beneath it, so the page reads as a company's About page that credits its
 * creator rather than as a personal portfolio hosted inside a product.
 */

/** Inline brand glyphs, so the page pulls no icon font or third-party asset. */
const ICONS = {
  github:
    'M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.555-1.11-4.555-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A9.96 9.96 0 0 0 22 12c0-5.52-4.48-10-10-10z',
  linkedin:
    'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.38-.03-3.16-1.93-3.16-1.93 0-2.22 1.5-2.22 3.06V21h-4V9z',
  upwork:
    'M18.6 5.7c-2.2 0-3.9 1.4-4.6 3.7-1.1-1.6-1.9-3.5-2.4-5.1H8.9v6.2c0 1.2-1 2.2-2.2 2.2s-2.2-1-2.2-2.2V4.3H1.8v6.2c0 2.7 2.2 4.9 4.9 4.9s4.9-2.2 4.9-4.9v-1c.2.5.5 1 .8 1.4l-1.7 8h2.7l1.2-5.8c1.1.7 2.3 1.1 3.6 1.1 2.9 0 5.3-2.4 5.3-5.4s-2.3-5.1-5.2-5.1h.3zm0 7.9c-1 0-2-.4-2.9-1.1l.3-1.1c.2-.9.9-2.9 2.6-2.9 1.4 0 2.5 1.1 2.5 2.5s-1.1 2.6-2.5 2.6z',
  website:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2c1.2 0 2.6 2.2 3.1 5H8.9C9.4 6.2 10.8 4 12 4zM4.3 10h3.3a20 20 0 0 0 0 4H4.3a8 8 0 0 1 0-4zm0 6h3.5c.4 1.9 1 3.5 1.8 4.5A8 8 0 0 1 4.3 16zm5.5 0h4.4C13.7 18.9 12.7 20 12 20s-1.7-1.1-2.2-4zm-.2-2a17 17 0 0 1 0-4h4.8a17 17 0 0 1 0 4H9.6zm4.6 6.5c.8-1 1.4-2.6 1.8-4.5h3.5a8 8 0 0 1-5.3 4.5zM16.4 14a20 20 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3zm2.4-6h-3c-.4-1.6-.9-3-1.6-4a8 8 0 0 1 4.6 4zM9.8 4c-.7 1-1.2 2.4-1.6 4h-3a8 8 0 0 1 4.6-4z',
  email:
    'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zm2.4.4L12 12l7.6-5.6H4.4zM20 8.3l-7.4 5.4a1 1 0 0 1-1.2 0L4 8.3V18h16V8.3z',
};

function LinkIcon({ name }) {
  const path = ICONS[name] || ICONS.website;
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d={path} />
    </svg>
  );
}

/**
 * Founder portrait with a graceful fallback.
 *
 * If the image is missing or fails to load, we swap in the founder's initials
 * rather than leaving a broken-image icon on a credibility page.
 */
function FounderPortrait({ name, photo }) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(/\s+/)

    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (failed || !photo) {
    return (
      <div
        className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-2xl font-black text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800"
        aria-hidden="true"
      >
        {initials || '—'}
      </div>
    );
  }

  return (
    <img
      src={photo}
      alt={`Portrait of ${name}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-28 w-28 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
    />
  );
}

export default function AboutView() {
  const { t } = useTranslation();
  const links = FOUNDER.links;


  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Platform identity */}
      <header className="flex flex-col items-center text-center">
        <MizanAILogo className="h-14 w-14" />
        <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
          {t('about_title', `About ${BRAND.name}`)}
        </h2>
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
          {BRAND.tagline}
        </p>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {t(
            'about_intro',
            `${BRAND.name} assesses digital assets and crypto protocols against defined ethical and Shariah compliance criteria, and returns a risk score with the reasoning behind it. It is free to use, and every audit is designed to be checked rather than simply trusted.`,
          )}
        </p>
      </header>

      {/* Why it was built */}
      <section className="mt-12" aria-labelledby="about-vision-heading">
        <h3
          id="about-vision-heading"
          className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
        >
          {t('about_vision_heading', `Why ${BRAND.name} was created`)}
        </h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {VISION.map((block) => (
            <article
              key={block.titleKey}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"
            >
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {t(block.titleKey, block.title)}
              </h4>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {t(block.bodyKey, block.body)}
              </p>

            </article>
          ))}
        </div>
      </section>

      {/* Meet the Founder */}
      <section className="mt-12" aria-labelledby="about-founder-heading">
        <h3
          id="about-founder-heading"
          className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
        >
          {t('about_founder_heading', 'Meet the Founder')}
        </h3>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
          {/* Brand band, so the profile card reads as part of the product. */}
          <div
            aria-hidden="true"
            className="h-20 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800"
          />

          <div className="px-6 pb-6 sm:px-8 sm:pb-8">
            {/* Pulled up over the band so the portrait overlaps it. */}
            <div className="-mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-end">
              <FounderPortrait name={FOUNDER.name} photo={FOUNDER.photo} />
              <div className="sm:pb-2">
                <h4 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                  {FOUNDER.name}
                </h4>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {t(FOUNDER.roleKey, FOUNDER.role)}
                </p>

              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {t(FOUNDER.bioKey, FOUNDER.bio)}

              </p>
            </div>

            {/* Expertise */}

            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t('about_expertise_label', 'Areas of expertise')}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {FOUNDER.expertise.map((area) => (
                  <li
                    key={area.key}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700/60 dark:text-slate-300"
                  >
                    {t(area.key, area.label)}
                  </li>
                ))}

              </ul>
            </div>

            {/* Professional links */}
            {links.length > 0 && (

              <div className="mt-7 border-t border-slate-100 pt-5 dark:border-slate-700">
                <ul className="flex flex-wrap gap-2.5">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.href.startsWith('mailto:')
                          ? {}
                          : { target: '_blank', rel: 'noopener noreferrer' })}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-600 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
                      >
                        <LinkIcon name={link.icon} />
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quiet attribution: the product leads, the byline closes. */}
      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        {t(FOUNDER_ATTRIBUTION_KEY, FOUNDER_ATTRIBUTION, {
          name: FOUNDER.name,
        })}

      </p>
    </div>
  );
}


