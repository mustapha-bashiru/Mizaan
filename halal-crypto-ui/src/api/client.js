/**
 * Single place where the frontend talks to the backend.
 *
 * Previously every component hardcoded http://127.0.0.1:8000, which made the
 * app impossible to deploy and let each caller invent its own error handling.
 * The base URL now comes from VITE_API_BASE_URL (see .env.example).
 */

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '');

const TOKEN_KEY = 'access_token';
const EMAIL_KEY = 'user_email';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  },
};

export const emailStore = {
  get: () => localStorage.getItem(EMAIL_KEY),
  set: (email) => localStorage.setItem(EMAIL_KEY, email),
};

/** Error carrying the HTTP status so callers can react to 401/429/502. */
export class ApiError extends Error {
  constructor(message, status, detail, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    // Stable machine-readable identifier (e.g. 'email_exists_verified') when
    // the backend sends one, so callers never string-match English prose.
    this.code = code;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  get isQuotaError() {
    return this.status === 429;
  }

  get isConflictError() {
    return this.status === 409;
  }
}

/**
 * FastAPI returns validation errors as an array of {loc, msg} objects, richer
 * business errors as a {code, message} object, and everything else as a
 * string. Flatten all three into one readable sentence.
 */
function normalizeDetail(detail, status) {
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.slice(-1)[0] : '';
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .join(' | ');
  }
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    return detail.message;
  }
  if (typeof detail === 'string' && detail.trim()) return detail;
  return `Request failed (HTTP ${status}).`;
}

/** Pulls the machine-readable error code out of a {code, message} detail. */
function extractCode(detail) {
  if (detail && typeof detail === 'object' && typeof detail.code === 'string') {
    return detail.code;
  }
  return null;
}

async function request(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const finalHeaders = { ...headers };

  if (auth) {
    const token = tokenStore.get();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  // Let the browser set the multipart boundary for FormData.
  const isFormData = body instanceof FormData;
  if (body && !isFormData) finalHeaders['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Unable to reach the analysis engine. Is the backend running?',
      0,
    );
  }

  if (response.status === 204) return null;

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const detail = payload?.detail ?? payload?.message;
    throw new ApiError(
      normalizeDetail(detail, response.status),
      response.status,
      detail,
      extractCode(detail),
    );
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authApi = {
  // NOTE: the backend expects JSON {email, password} - not an OAuth2 form body.
  login: (email, password) =>
    request('/api/login', { method: 'POST', body: { email, password }, auth: false }),

  register: (email, password) =>
    request('/api/register', { method: 'POST', body: { email, password }, auth: false }),

  verifyOtp: (email, otp) =>
    request('/api/verify-otp', { method: 'POST', body: { email, otp }, auth: false }),

  resendOtp: (email) =>
    request('/api/resend-otp', { method: 'POST', body: { email }, auth: false }),

  profile: () => request('/api/profile'),
};

// ---------------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------------
export const auditApi = {
  /** `formData` must already use the backend's field names. */
  run: (formData) => request('/api/audit', { method: 'POST', body: formData }),

  scholarChat: (question, auditContext = '') =>
    request('/api/scholar-chat', {
      method: 'POST',
      body: { question, audit_context: auditContext },
    }),
};

// ---------------------------------------------------------------------------
// Audit history
// ---------------------------------------------------------------------------
export const historyApi = {
  /**
   * One page of the caller's own audits.
   * Empty/nullish params are dropped so the backend applies its defaults.
   */
  list: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, value);
      }
    });
    const suffix = query.toString();
    return request(`/api/history${suffix ? `?${suffix}` : ''}`);
  },

  get: (id) => request(`/api/history/${id}`),

  remove: (id) => request(`/api/history/${id}`, { method: 'DELETE' }),

  rerunContext: (id) => request(`/api/history/${id}/rerun-context`),

  /**
   * Publishes one audit behind an unguessable link, for sharing.
   *
   * Idempotent on the server, so calling it again returns the link that was
   * already handed out rather than invalidating it.
   */
  share: (id) => request(`/api/history/${id}/share`, { method: 'POST' }),

  /**
   * Downloads the report PDF.
   *
   * A plain <a href> cannot be used because the endpoint requires an
   * Authorization header, so the file is fetched explicitly and handed to the
   * browser through a temporary object URL that is revoked straight after.
   */
  downloadPdf: async (id, filename) => {
    const token = tokenStore.get();
    const response = await fetch(`${API_BASE_URL}/api/history/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      let detail;
      try {
        detail = (await response.json())?.detail;
      } catch {
        detail = undefined;
      }
      throw new ApiError(
        normalizeDetail(detail, response.status),
        response.status,
        detail,
      );
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename || `mizaan-audit-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      // Without this the blob is retained for the life of the document.
      URL.revokeObjectURL(objectUrl);
    }
  },
};

// ---------------------------------------------------------------------------
// Settings & donations
// ---------------------------------------------------------------------------
export const settingsApi = {
  getProfile: () => request('/api/settings/profile'),
  updateProfile: (payload) =>
    request('/api/settings/profile', { method: 'PUT', body: payload }),

  // POST, not DELETE: the confirming password travels in the body, and DELETE
  // bodies are unreliable across proxies. Resolves to null on success (204).
  deleteAccount: (currentPassword) =>
    request('/api/settings/account/delete', {
      method: 'POST',
      body: { current_password: currentPassword },
    }),

};

// ---------------------------------------------------------------------------
// Public (shared) reports
// ---------------------------------------------------------------------------
export const publicReportsApi = {
  // Deliberately unauthenticated: the share token is the only credential, and
  // sending the owner's bearer token here would be pointless.
  get: (shareToken) =>
    request(`/api/reports/${encodeURIComponent(shareToken)}`, { auth: false }),
};

export const donationsApi = {
  info: () => request('/api/donations/info', { auth: false }),
  getPreference: () => request('/api/donations/toggle'),
  setPreference: (enabled) =>
    request('/api/donations/toggle', {
      method: 'PUT',
      body: { donation_prompt_enabled: enabled },
    }),
};
