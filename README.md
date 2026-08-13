# Mizaan AI

**AI-Powered Ethical Audit Platform**

AI-assisted Shariah compliance research for crypto protocols and e-commerce businesses.

Mizaan AI takes a project's public materials — whitepaper text, terms and policies, uploaded
documents, a website URL — and produces a structured Shariah risk report covering riba,
gharar, maysir, and impermissible-sector exposure, then renders it as a branded,
downloadable PDF.

> **Not a fatwa.** Mizaan AI produces AI-generated research to support human review. It is not
> a religious ruling and does not constitute financial, legal, or investment advice. Always
> consult a qualified scholar before acting on a report.

---

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment configuration](#environment-configuration)
- [Running locally](#running-locally)
- [Tests, lint, and build](#tests-lint-and-build)
- [API reference](#api-reference)
- [Deployment](#deployment)
- [Security notes](#security-notes)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Two audit tracks** — crypto protocol and e-commerce business intake forms with
  track-specific prompting.
- **Multi-source intake** — pasted whitepaper/terms text, file uploads (PDF, DOCX, images),
  and server-side URL scraping with size and timeout caps.
- **Structured reports** — a validated report schema covering verdict, confidence, risk
  factors, evidence, and scholar-facing notes.
- **Server-rendered PDF** — enterprise-styled ReportLab output with the Mizaan brand mark
  drawn as native vectors, so reports stay sharp at any zoom.
- **Report history** — per-user audit history with authenticated, ownership-checked PDF
  downloads. Stored PDFs live outside any statically served directory.
- **Scholar chat** — a question/answer surface scoped to an existing audit's context.
- **Email OTP auth** — registration with emailed verification codes that expire after 10
  minutes and are consumed on use, JWT sessions, and password reset by signed token.
- **Account self-service** — change email or password, and permanently delete the account
  along with every stored audit and PDF.
- **Fair-use quota** — configurable daily audit limit per account.
- **Trilingual UI** — English, French, and Arabic, with right-to-left layout support.
- **Donation model** — free to use, voluntary sadaqah. No subscription, no paywall.

## Screenshots

Replace the placeholder files in `docs/screenshots/` with real captures. Keep the same
filenames and the images below will render automatically.

| | |
|---|---|
| **Landing** <br> ![Landing page](docs/screenshots/01-landing.png) | **Audit intake** <br> ![Audit intake form](docs/screenshots/02-intake-form.png) |
| **Report view** <br> ![Shariah report viewer](docs/screenshots/03-report.png) | **Generated PDF** <br> ![Generated PDF report](docs/screenshots/04-pdf-report.png) |
| **History** <br> ![Audit history](docs/screenshots/05-history.png) | **Scholar chat** <br> ![Scholar chat](docs/screenshots/06-scholar-chat.png) |

> When capturing screenshots, use a throwaway demo account and sample project data. Do not
> publish real user reports, email addresses, or any frame showing an API key or token.

## Architecture

```
┌──────────────────────────┐         ┌───────────────────────────┐
│  React 19 + Vite (SPA)   │  HTTPS  │   FastAPI (Python 3.11+)  │
│  Tailwind · framer-motion│ ──────▶ │   JWT auth · CORS allowlist│
│  i18next (en/fr/ar)      │  JSON   │   Pydantic validation      │
│  jsPDF (client export)   │ ◀────── │   ReportLab (server PDF)   │
└──────────────────────────┘         └─────────────┬─────────────┘
                                                   │
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                     ┌────────────────┐  ┌──────────────────┐  ┌──────────────┐
                     │  SQLAlchemy    │  │  Google Gemini   │  │  SMTP (OTP,  │
                     │  SQLite / PG   │  │  (audit engine)  │  │  password    │
                     │                │  │                  │  │  reset)      │
                     └────────────────┘  └──────────────────┘  └──────────────┘
```

The audit pipeline (`pipeline.py`) normalises intake, calls the model, and validates the
response against `report_schema.py` before anything is persisted or rendered.

## Repository layout

```
.
├── main.py                  FastAPI app, auth + audit + scholar-chat endpoints
├── config.py                Environment-driven settings with startup validation
├── auth.py                  Password hashing, JWT issue/verify, current-user dependency
├── models.py                SQLAlchemy ORM models
├── database.py              Engine and session factory
├── migrations.py            Idempotent schema migrations (also a CLI)
├── pipeline.py              Audit orchestration and Gemini calls
├── report_schema.py         Report validation and normalisation
├── report_pdf.py            Server-side ReportLab PDF renderer
├── history.py               Report history + authenticated PDF download router
├── settings.py              User profile router
├── donations.py             Donation info/preference router
├── password_reset.py        Password reset request/confirm router
├── services.py              Uploads, SMTP delivery, quota helpers
├── utils.py                 URL scraping and text extraction
├── requirements.txt         Pinned backend dependencies
├── pytest.ini               Test discovery scoped to tests/
├── tests/                   Backend test suite
├── tools/verify_pdf.py      Manual PDF render check
├── sample_reports/          Example report JSON for offline PDF work
├── docs/screenshots/        Screenshot placeholders for this README
└── halal-crypto-ui/         React + Vite frontend
    ├── src/                 Components, i18n, API client, client PDF export
    ├── public/              Logo and favicon assets
    └── package.json
```

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11 or newer | Verified on 3.14.5 |
| Node.js | 20 or newer | Verified on 24.18.0 |
| npm | 10 or newer | Verified on 11.6.0 |
| Google Gemini API key | — | Required for live audits ([get one](https://aistudio.google.com/apikey)) |
| SMTP credentials | — | Optional locally; see [OTP without SMTP](#otp-without-smtp) |

## Installation

Clone the repository:

```bash
git clone https://github.com/<your-username>/mizaan.git
cd mizaan
```

### Backend

```bash
python -m venv .venv

# macOS / Linux
source .venv/bin/activate
# Windows (PowerShell)
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

### Frontend

```bash
cd halal-crypto-ui
npm ci
cd ..
```

`npm ci` installs exactly what is in `package-lock.json`. Use it instead of `npm install`
for reproducible setups.

## Environment configuration

Two environment files, by design — they target different runtimes and different trust
boundaries:

| File | Consumed by | Contains |
|---|---|---|
| `.env` (root) | FastAPI backend | Secrets: Gemini key, SMTP password, JWT signing key, database URL |
| `halal-crypto-ui/.env` | Vite build | Only `VITE_`-prefixed public values |

Anything prefixed `VITE_` is **compiled into the browser bundle and is publicly readable**.
Never put a secret there.

Create both from their templates:

```bash
cp .env.example .env
cp halal-crypto-ui/.env.example halal-crypto-ui/.env
```

Generate a JWT signing key and paste it into `.env` as `JWT_SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then set `GEMINI_API_KEY`. The backend logs a warning at startup for any missing or weak
required value, so check the console on first run.

### Key backend variables

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | Set to `production` to enable production guards |
| `DATABASE_URL` | `sqlite:///./mizaan.db` | Any SQLAlchemy URL; use PostgreSQL in production |
| `JWT_SECRET_KEY` | *(none)* | **Required.** Minimum 32 characters |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Session lifetime |
| `CORS_ALLOW_ORIGINS` | localhost:5173 | Comma-separated. Must be explicit in production |
| `GEMINI_API_KEY` | *(none)* | **Required** for live audits |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Audit model |
| `SMTP_SENDER_EMAIL` / `SMTP_SENDER_PASSWORD` | *(none)* | Use an app-specific password, never an account password |
| `LOG_OTP_TO_CONSOLE` | `true` | Dev convenience. **Set `false` in production** |
| `DAILY_AUDIT_LIMIT` | `5` | Per-account fair-use quota |
| `REPORT_STORAGE_DIR` | `./report_storage` | Must stay outside any served directory |

See `.env.example` for the full annotated list, including upload and scraping caps.

### OTP without SMTP

With `LOG_OTP_TO_CONSOLE=true` and `APP_ENV=development`, verification codes are written to
the backend log instead of emailed, so you can register and sign in without configuring
SMTP. This is ignored when `APP_ENV=production`.

## Running locally

Initialise the database schema (idempotent, safe to re-run):

```bash
python migrations.py
```

Start the backend:

```bash
uvicorn main:app --reload --port 8000
```

In a second terminal, start the frontend:

```bash
cd halal-crypto-ui
npm run dev
```

| Surface | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API root / health | http://127.0.0.1:8000/ |
| Swagger UI | http://127.0.0.1:8000/docs |
| ReDoc | http://127.0.0.1:8000/redoc |

### Demo walkthrough

1. Open http://localhost:5173 and register. Copy the OTP from the backend log.
2. Pick **Crypto Protocol**, enter a project name and token ticker, and paste whitepaper
   text or a project URL.
3. Submit, and read the generated verdict, risk factors, and evidence.
4. Download the PDF, then confirm the report appears under history.
5. Open scholar chat and ask a follow-up question about the audit.

No API key? `sample_reports/uniswap_sample.json` renders a full PDF offline:

```bash
python tools/verify_pdf.py
```

## Tests, lint, and build

```bash
# Backend tests
pytest

# Frontend lint
cd halal-crypto-ui && npm run lint

# Frontend production build
cd halal-crypto-ui && npm run build

# Preview the production build
cd halal-crypto-ui && npm run preview
```

## API reference

All `/api/*` routes except registration, login, OTP, and password reset require
`Authorization: Bearer <token>`.

### Authentication

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/register` | Create an account and send an OTP |
| `POST` | `/api/resend-otp` | Re-send the verification code |
| `POST` | `/api/verify-otp` | Verify the code, receive a JWT |
| `POST` | `/api/login` | Sign in, receive a JWT |
| `GET` | `/api/profile` | Current user and remaining quota |
| `POST` | `/api/password-reset/request` | Email a reset token |
| `POST` | `/api/password-reset/confirm` | Set a new password |

### Audits

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/audit` | Run an audit (multipart: fields + optional files) |
| `POST` | `/api/scholar-chat` | Ask a question against an audit's context |

### History

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/history` | Paginated audit history |
| `GET` | `/api/history/{audit_id}` | Full stored report |
| `GET` | `/api/history/{audit_id}/pdf` | Download the PDF (ownership checked) |
| `GET` | `/api/history/{audit_id}/rerun-context` | Prefill the form from a past audit |
| `DELETE` | `/api/history/{audit_id}` | Delete an audit and its PDF |

### Settings and donations

| Method | Path | Purpose |
|---|---|---|
| `GET` / `PUT` | `/api/settings/profile` | Read or update profile |
| `POST` | `/api/settings/account/delete` | Delete the account and all owned data |
| `GET` | `/api/donations/info` | Public donation configuration |
| `GET` / `PUT` | `/api/donations/toggle` | Read or set donation prompt preference |

## Deployment

### 1. Build the frontend

```bash
cd halal-crypto-ui
npm ci
VITE_API_BASE_URL=https://api.your-domain.com npm run build
```

`dist/` is a static bundle. Deploy it to any static host — Netlify, Vercel, Cloudflare
Pages, S3 + CloudFront, or nginx. `VITE_API_BASE_URL` is baked in at build time, so
rebuild when the backend URL changes.

### 2. Deploy the backend

Run under a production ASGI server. Do not use `python main.py` or `--reload` in
production:

```bash
pip install -r requirements.txt gunicorn
python migrations.py
gunicorn main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 4 \
  --bind 0.0.0.0:8000
```

Example `Dockerfile` for the backend:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn
COPY . .
ENV APP_ENV=production
EXPOSE 8000
CMD ["gunicorn", "main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "4", "--bind", "0.0.0.0:8000"]
```

Platform notes: on Railway, Render, or Fly.io, set the start command to the `gunicorn` line
above and inject environment variables through the platform's secret store.

### 3. Production checklist

- [ ] `APP_ENV=production`
- [ ] `JWT_SECRET_KEY` is a fresh 32+ character random value, injected as a secret
- [ ] `LOG_OTP_TO_CONSOLE=false`
- [ ] `CORS_ALLOW_ORIGINS` lists your exact frontend origin — never `*`
- [ ] `DATABASE_URL` points at managed PostgreSQL, not SQLite
- [ ] `REPORT_STORAGE_DIR` is a persistent volume outside the web root
- [ ] TLS terminated at the proxy or platform edge
- [ ] Secrets supplied by the platform's secret store, never committed
- [ ] `python migrations.py` run against the production database

SQLite is fine for local development and demos but is not suitable for concurrent
production traffic. Switch `DATABASE_URL` to PostgreSQL before launch.

## Security notes

- No secrets are committed. `.env` is git-ignored; `.env.example` ships placeholders only.
- Passwords are bcrypt-hashed. OTPs are stored hashed with an expiry and attempt cap.
- JWTs are HS256-signed. The app refuses to issue tokens when `JWT_SECRET_KEY` is unset.
- CORS uses an explicit origin allowlist, and startup validation rejects `*` in production.
- Generated PDFs are stored outside served directories and reachable only through an
  authenticated, ownership-checked endpoint.
- URL scraping enforces byte, character, and timeout caps and does not follow redirects.
- Uploads are capped by file count and total size.

If you find a vulnerability, please open a private security advisory rather than a public
issue.

## Known limitations

- The client-side PDF export path depends on `jspdf` 2.x, which carries an open `dompurify`
  advisory. Patching requires a major upgrade to `jspdf` 4.x and `jspdf-autotable` 5.x, a
  breaking change to the export code that is intentionally deferred.
- The frontend main chunk is above Vite's 500 kB warning threshold. Lazy-loading the PDF
  export module would move roughly a third of it off the initial load.
- Audit quality depends on the input material. Sparse whitepaper text yields low-confidence
  verdicts.

## Roadmap

Planned, roughly in order of priority:

- **Scholar review workflow** — let a qualified reviewer annotate and countersign a report,
  so an audit can carry human endorsement alongside the AI analysis.
- **Lazy-loaded PDF export** — move the client export module off the initial bundle and
  upgrade `jspdf` to clear the outstanding advisory.
- **Comparative audits** — score two protocols side by side against the same criteria.
- **Public report links** — opt-in shareable URLs for a single report, revocable by owner.
- **Additional languages** — Urdu, Indonesian, and Turkish, following the existing i18n
  structure.
- **Webhook / API access** — programmatic audits for teams integrating compliance checks
  into their own pipelines.

## Contributing

Contributions are welcome, especially corrections to audit reasoning and false-positive
reports.

1. Fork the repository and create a branch from `main`:
   `git checkout -b feature/short-description`
2. Follow the existing conventions. The backend is plain FastAPI with typed Pydantic
   models; the frontend uses functional components and Tailwind utility classes. No new
   frameworks or state libraries without discussion first.
3. Keep user-facing strings in `halal-crypto-ui/src/i18n.js` for all three locales rather
   than hardcoding English.
4. Run the checks before opening a pull request:
   ```bash
   pytest
   cd halal-crypto-ui && npm run lint && npm run build
   ```
5. Write a clear PR description covering what changed, why, and how you tested it.

For research feedback, false positives, or security concerns, contact the research team at
`support@mizaanai.co`. Please report vulnerabilities through a private security advisory
rather than a public issue.

## License

[MIT](LICENSE) © Mizaan AI


