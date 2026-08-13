# Mizaan — Frontend

React 19 + Vite single-page app for Mizaan. This is one half of the project; see the
[root README](../README.md) for the full setup, the backend, and deployment instructions.

## Quick start

The backend must be running first (default `http://127.0.0.1:8000`).

```bash
npm ci
cp .env.example .env
npm run dev
```

The dev server starts on http://localhost:5173.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with hot module replacement |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm run lint` | Oxlint over `src/` |

## Environment

Only `VITE_`-prefixed variables are exposed to the browser, and they are **compiled into
the bundle where anyone can read them**. Never put a secret here — API keys, SMTP
credentials, and the JWT signing key belong in the backend `.env` at the repository root.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Base URL of the FastAPI backend |

This value is baked in at build time, so rebuild whenever the backend URL changes.

## Structure

```
src/
├── App.jsx              Root component and routing/view state
├── ProjectIntakeForm.jsx Crypto and e-commerce audit intake
├── i18n.js              English, French, and Arabic translations
├── api/client.js        Fetch wrapper with auth header handling
├── components/          Report viewer, auth modal, history, donation card, logo
├── config/              Client-side configuration
└── utils/pdfGenerator.js Client-side PDF export (jsPDF)
```

## Notes

- **Two PDF paths exist.** The server renders the canonical report with ReportLab; this
  client path is a convenience export. The client fetches `/mizan-ai-logo.svg` at runtime,
  so brand updates in `public/` apply automatically.
- **Internationalisation** covers `en`, `fr`, and `ar`, with right-to-left layout for
  Arabic. When adding a key, add it to all three blocks and avoid duplicating an existing
  key — a duplicate silently overrides the earlier entry.
