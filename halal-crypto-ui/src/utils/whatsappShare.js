/**
 * WhatsApp sharing: message composition and app hand-off.
 *
 * Why not api.whatsapp.com / wa.me
 * --------------------------------
 * Both resolve to a WhatsApp *web page* first ("Open app" / "Continue to
 * WhatsApp Web"), so the user has to get past an interstitial before they can
 * pick a chat. The `whatsapp://` scheme is handed straight to the installed
 * application, which opens on the contact picker with the message prefilled —
 * which is the behaviour a "Share on WhatsApp" button implies.
 *
 * Detecting the hand-off
 * ----------------------
 * Nothing reports whether a custom scheme was actually handled. Success is
 * therefore inferred from the page losing the foreground: if WhatsApp takes
 * over, the document is hidden (mobile) or the window is blurred (desktop). If
 * neither happens within the grace period the link was not handled, and the
 * caller is told so it can fall back or explain.
 */

const APP_SCHEME = 'whatsapp://send?text=';
const WEB_TARGET = 'https://web.whatsapp.com/send?text=';

// Long enough for a slow protocol handler to take focus, short enough to stay
// inside the browser's transient-activation window so the desktop fallback is
// not treated as an unsolicited popup.
const HANDOFF_GRACE_MS = 1200;

// The chat gets a summary, not the audit. Anything longer turns the message
// into a wall of text that nobody reads and that WhatsApp collapses anyway.
const SUMMARY_LIMIT = 400;

// Unicode "first-strong isolate": the run inside takes its own direction and
// cannot reorder the text around it. Used for values that are Latin/numeric
// inside an RTL sentence — without it, "Bitcoin ($BTC)" renders with the
// bracket flipped to the wrong end of the name.
const FSI = '\u2068';
const PDI = '\u2069';

const DEFAULT_LABELS = {
  title: 'Mizaan AI — Shariah Compliance Audit',
  project: 'Project',
  riskScore: 'Risk Score',
  riskLevel: 'Risk Level',
  summary: 'Executive Summary',
  fullReport: 'View the complete audit report',
  poweredBy: 'Powered by Mizaan AI',
};

/**
 * Reports whether this is a phone/tablet.
 *
 * iPadOS 13+ deliberately reports itself as a Mac, so the touch-point count is
 * what separates an iPad from a desktop Safari.
 */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;

  if (navigator.userAgentData?.mobile) return true;

  const ua = navigator.userAgent || '';
  const isIpadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;

  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|BlackBerry/i.test(ua) || isIpadOS;
}

/** Collapses whitespace and trims to a sentence (or word) boundary. */
function condense(text, limit = SUMMARY_LIMIT) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const sentenceEnd = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  );

  // Only honour a sentence break if it keeps most of the excerpt; otherwise the
  // summary would be cut down to a single short line.
  if (sentenceEnd > limit * 0.5) return cut.slice(0, sentenceEnd + 1);

  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Builds the shared message: a branded card, with the detail behind the link.
 *
 * WhatsApp markup is `*bold*` and `_italic_`. Every field is optional so a
 * partially populated report still produces a clean message rather than lines
 * reading "undefined".
 */
export function buildWhatsAppMessage({
  projectName,
  symbol,
  riskScore,
  riskLevel,
  executiveSummary,
  reportUrl,
  isRtl = false,
  labels = {},
} = {}) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const name = (projectName || '').trim() || 'Unnamed Project';
  const ticker = (symbol || '').trim();

  // Only wrapped for RTL messages: the isolates are invisible, but there is no
  // reason to emit control characters into a message that reads left to right.
  const isolate = (value) => (isRtl ? `${FSI}${value}${PDI}` : value);

  const lines = [
    `🛡️ *${text.title}*`,
    '',
    `📊 *${text.project}:* ${isolate(ticker ? `${name} ($${ticker})` : name)}`,
  ];

  if (Number.isFinite(Number(riskScore))) {
    lines.push(`⚖️ *${text.riskScore}:* ${isolate(`${Number(riskScore)}/100`)}`);
  }
  if (riskLevel) {
    lines.push(`📌 *${text.riskLevel}:* ${riskLevel}`);
  }

  const summary = condense(executiveSummary);
  if (summary) {
    lines.push('', `📋 *${text.summary}*`, summary);
  }

  if (reportUrl) {
    lines.push('', `🔍 *${text.fullReport}*`, isolate(reportUrl));
  }

  lines.push('', `_${text.poweredBy}_`);

  return lines.join('\n');
}

/** The WhatsApp Web address for a message, for use as a manual fallback. */
export function whatsAppWebUrl(message) {
  return `${WEB_TARGET}${encodeURIComponent(message)}`;
}

/**
 * Opens WhatsApp with `message` prefilled.
 *
 * Mobile gets the app deep link only: WhatsApp Web is not usable in a phone
 * browser, so there is nothing to fall back to and the caller explains instead.
 * Desktop falls back to WhatsApp Web when the desktop app does not answer.
 *
 * Resolves to `{ opened, webUrl }`. `opened: false` means the caller should
 * surface the fallback — it never throws, so a share failure cannot break the
 * report view.
 *
 * Note: a user who dismisses the browser's "Open WhatsApp?" prompt blurs the
 * page, which is indistinguishable from the app opening. That is treated as
 * success on purpose — they chose not to continue, and a fallback tab would
 * override that choice.
 */
export function shareOnWhatsApp(message) {
  const webUrl = whatsAppWebUrl(message);

  if (typeof window === 'undefined') {
    return Promise.resolve({ opened: false, webUrl });
  }

  const deepLink = `${APP_SCHEME}${encodeURIComponent(message)}`;

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const cleanup = () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onHandoff);
      window.removeEventListener('blur', onHandoff);
    };

    const settle = (opened) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ opened, webUrl });
    };

    function onHandoff() {
      settle(true);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') settle(true);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onHandoff);
    window.addEventListener('blur', onHandoff);

    timer = window.setTimeout(() => {
      if (isMobileDevice()) {
        settle(false);
        return;
      }

      // Popup blockers can still refuse this if the click's activation has
      // lapsed; a null handle is reported as "not opened" so the caller can
      // offer the link for the user to click themselves.
      const win = window.open(webUrl, '_blank', 'noopener,noreferrer');
      settle(Boolean(win));
    }, HANDOFF_GRACE_MS);

    // Assigning location does not unload the page when the scheme is
    // unhandled, so the report view survives a failed attempt.
    try {
      window.location.href = deepLink;
    } catch {
      settle(false);
    }
  });
}
