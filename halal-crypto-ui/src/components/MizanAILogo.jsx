import React, { useId } from 'react';

/**
 * Mizaan emblem, drawn as a white mark on a green rounded-square tile.
 *
 * The tile is the brand container: a soft emerald→deep-teal gradient with
 * blended (rounded) sides, a faint inner highlight and a hairline edge so it
 * reads as a solid app icon on both light and dark surfaces. The mark itself is
 * white for maximum contrast against the green — the previous green-on-
 * transparent version disappeared on dark backgrounds and had no consistent
 * silhouette across the app.
 *
 * Geometry is unchanged from the established mark (balance beam, pillar, pans,
 * gold node) so this is a treatment change, not a new brand.
 */
export default function MizanAILogo({
  className = 'h-12 w-12',
  title = 'Mizaan Logo',
}) {
  const uid = useId().replace(/:/g, '');
  const tileGrad = `mizan-tile-${uid}`;
  const sheenGrad = `mizan-sheen-${uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        {/* Green tile: emerald highlight into deep teal for depth. */}
        <linearGradient id={tileGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="55%" stopColor="#0F766E" />
          <stop offset="100%" stopColor="#064E3B" />
        </linearGradient>
        {/* Subtle top sheen so the tile edges blend rather than look flat. */}
        <linearGradient id={sheenGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Rounded-square tile with blended sides. */}
      <rect width="64" height="64" rx="15" fill={`url(#${tileGrad})`} />
      <rect width="64" height="64" rx="15" fill={`url(#${sheenGrad})`} />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="14.25"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />

      {/* Balance mark in white: beam, pillar, base and the two pans. */}
      <g
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 26H49" />
        <path d="M32 26V45" />
        <path d="M23 46H41" />
        <path d="M10 30q6 8 12 0" />
        <path d="M42 30q6 8 12 0" />
      </g>

      {/* Gold pivot node, retained from the original mark. */}
      <circle cx="32" cy="19" r="4.6" fill="#FBBF24" />
      <circle cx="32" cy="19" r="1.7" fill="#FFFFFF" opacity="0.95" />
    </svg>
  );
}
