# Dispatch: Job Application Automation

A private, single-user web app that turns "find a recruiter's email, write a message, attach a resume, send" into a reviewed workflow.

1. Upload a screenshot of a job post (or type an address). Text is read **in your browser** with Tesseract.js.
2. Pick a category, template and resume. Drafts are rendered from your saved templates.
3. Every draft lands in a **Review queue**. Nothing is ever sent without your explicit approval.
4. Approved emails are sent one at a time through the **official Gmail API** from your own account.

Stack: Next.js (App Router) · TypeScript · MongoDB + Mongoose · GridFS · Tailwind CSS 4 · shadcn-style components (Radix) · Lucide · React Hook Form + Zod · Tesseract.js · Google OAuth 2.0 + Gmail API.

---

## Contents

- [Quick start](#quick-start)
- [MongoDB setup](#mongodb-setup)
- [Google Cloud / Gmail API setup](#google-cloud--gmail-api-setup)
- [Environment variables](#environment-variables)
- [Using the app](#using-the-app)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Production deployment](#production-deployment)
- [Security model](#security-model)
- [Sending limits and Gmail policy](#sending-limits-and-gmail-policy)
- [Extending: future automation](#extending-future-automation)
- [Known limitations](#known-limitations)

## Quick start

Requires Node.js 20.9+ and a MongoDB database.

```bash
npm install
cp .env.example .env            # then fill it in (see below)
npm run generate-secrets        # prints TOKEN_ENCRYPTION_KEY and SESSION_SECRET: paste into .env
npm run create-admin            # prompts for your email and a password (12+ characters)
npm run dev                     # http://localhost:3000
```

Production build: `npm run build && npm start`.

> `npm run create-admin` uses `tsx` (a dev dependency). On a host that installs only production dependencies, run it from your own machine against the production `MONGODB_URI`, or install dev dependencies once.

**Administrator account.** There is no sign-up page and no default password. `create-admin` hashes your password with bcrypt (cost 12) and stores it in MongoDB. It also works non-interactively: `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' npm run create-admin`. Re-running it with the same email resets the password. The app is single-user, so a second, different email is refused unless `ALLOW_SECOND_USER=1`.

## MongoDB setup

Pick one:

**Docker (local)**
```bash
docker run -d --name jaa-mongo -p 27017:27017 -v jaa-mongo-data:/data/db mongo:7
# MONGODB_URI=mongodb://127.0.0.1:27017
```

**MongoDB Atlas (free tier works)**
1. Create a cluster, then a database user (Database Access).
2. Allow your IP, or your host's egress IPs (Network Access).
3. Copy the `mongodb+srv://…` connection string into `MONGODB_URI`.

**Local install:** <https://www.mongodb.com/docs/manual/installation/>.

Indexes are created automatically on first connection. Use real MongoDB (or Atlas): the schema relies on partial unique indexes ("one default template/resume") and TTL indexes, which some MongoDB-compatible servers do not implement. Resumes are stored in GridFS (bucket `resumes`) in the same database.

## Google Cloud / Gmail API setup

You need your own OAuth client. It is free.

1. Open <https://console.cloud.google.com/> and create a project.
2. **APIs & Services → Library →** search **Gmail API → Enable**.
3. **APIs & Services → OAuth consent screen** (Google may call this "Google Auth Platform"):
   - User type **External**. App name e.g. "Dispatch". Add your own email as support and developer contact.
   - **Scopes / Data access:** add `https://www.googleapis.com/auth/gmail.send`. (`openid` and `email` are also used, only to show which account is connected.) Do not add anything else.
   - **Audience / Test users:** add the Gmail address you will send from.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**:
   - **Authorized redirect URIs:** `http://localhost:3000/api/gmail/callback` and, later, `https://YOUR-DOMAIN/api/gmail/callback`. It must match `GOOGLE_REDIRECT_URI` exactly.
5. Copy the client ID and secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. In the app: **Gmail integration → Connect Gmail account**, then approve the permission.

**Important: testing mode and refresh tokens.** While the consent screen's publishing status is **Testing**, Google expires refresh tokens after **7 days**, and you will need to reconnect weekly (the app shows "Reconnect" when this happens). For lasting access on a personal account, set the publishing status to **In production**. For personal use of a single account you do not need to complete verification; Google shows an "unverified app" warning that you can click through. `gmail.send` is a sensitive scope, so verification is only required to serve other users.

The app requests only `gmail.send`. It cannot read, search or delete mail.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB_NAME` | Database name (default `job_application_automation`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client from Google Cloud |
| `GOOGLE_REDIRECT_URI` | `<APP_URL>/api/gmail/callback`, must match Google Cloud |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes (base64 or 64 hex). Encrypts Gmail tokens (AES-256-GCM) |
| `SESSION_SECRET` | 32+ random characters. Signs the session cookie |
| `APP_URL` | Public base URL, no trailing slash |
| `NEXT_PUBLIC_TESSERACT_LANG_PATH` | *Optional.* Self-host OCR language data instead of the default CDN |

Generate secrets with `npm run generate-secrets` (or `openssl rand -base64 32` and `openssl rand -base64 48`). Never commit `.env`. It is in `.gitignore`. Changing `TOKEN_ENCRYPTION_KEY` makes stored Gmail tokens unreadable, so you would reconnect Gmail.

## Using the app

| Page | What it does |
| --- | --- |
| **Dashboard** | Totals, today's usage vs. your cap, connected Gmail account, 14-day chart, recent applications |
| **New application** | Screenshot OCR or manual emails → choose category/template/resume → edit drafts → add to the review queue (or save as drafts) |
| **Review queue** | View, edit, approve, reject, delete (single or bulk). **Send approved** sends with live progress |
| **Application history** | Search, status/category/date filters, pagination, Gmail message IDs |
| **Email templates** | Create/edit/delete/duplicate, activate, default per category, preferred resume, live preview |
| **Resume manager** | Upload multiple PDFs, rename, set default, authenticated download, delete |
| **Gmail integration** | Connect, show connected address, reconnect, disconnect (revokes with Google) |
| **Settings** | Candidate profile (optional template variables), daily cap, send interval, retries, time zone |

**Template syntax**

```
{{candidate_name}}                       value (empty if unset)
{{recruiter_name|Hiring Manager}}        value, or the inline fallback
{{#company_name}} at {{company_name}}{{/company_name}}   shown only when set
{{^company_name}}...{{/company_name}}    shown only when NOT set
```

Variables: `candidate_name, candidate_email, candidate_phone, job_role, company_name, recruiter_name, current_title, years_experience, primary_skills, secondary_skills, portfolio_url, linkedin_url, github_url`. Company and recruiter are optional; by default they fall back to "your organization" and "Hiring Manager" so the email reads correctly without them. No personal details are hard-coded anywhere. Empty profile fields are simply omitted.

**Screenshots are never stored.** OCR runs in the browser. The image is shown only while it is being read, then released from memory; only the recognised text is searched for email addresses. Nothing image-related is uploaded to the server, MongoDB, GitHub or any third party. The first OCR run downloads the Tesseract engine and English language data (about 10 MB) from a public CDN, so it needs internet access. Set `NEXT_PUBLIC_TESSERACT_LANG_PATH` to self-host the language data.

## Project structure

```
.
├── .env.example  .gitignore  README.md
├── package.json  package-lock.json  tsconfig.json  next.config.ts  eslint.config.mjs  vitest.config.mts
├── scripts/
│   ├── create-admin.ts        create / reset the administrator (bcrypt)
│   ├── generate-secrets.mjs   print fresh secrets
│   └── smoke-test.mjs         end-to-end HTTP checks against a running server (no Gmail calls)
├── tests/                     Vitest: extraction, templates, MIME, Gmail errors, validation, DB integration
└── src/
    ├── proxy.ts               optimistic redirect for signed-out visitors (not the security boundary)
    ├── models/                User, CandidateProfile, EmailTemplate, Resume, GmailConnection,
    │                          EmailQueue, Application, AppSettings, RateLimit
    ├── lib/
    │   ├── http.ts            route() wrapper: CSRF origin check, server-side auth, rate limit, error JSON
    │   ├── session.ts auth.ts crypto.ts rate-limit.ts env.ts db.ts gridfs.ts limits.ts validators.ts
    │   ├── email/             extract.ts (OCR text → emails) · template.ts · mime.ts · defaults.ts
    │   ├── gmail/             oauth.ts (PKCE) · client.ts (messages.send + error classes) · service.ts (token refresh)
    │   ├── queue/             status.ts (state machine) · service.ts · sender.ts (controlled sending)
    │   └── automation/        pipeline.ts: extension point for future modules
    ├── app/
    │   ├── login/  (app)/{dashboard,applications/new,review,history,templates,resumes,gmail,settings}
    │   └── api/               auth, dashboard, templates, resumes (+download), profile, settings, gmail/*,
    │                          compose/preview, queue (+bulk, process), applications (+duplicates), health
    └── components/            ui/ (Button, Dialog, …) · app-shell · new-application · review · templates · …
```

## Testing

```bash
npm run typecheck && npm run lint && npm test
```

- `npm test` runs unit tests (email extraction, template rendering, MIME building, Gmail error classification with mocked responses, validation, encryption, time windows, status transitions) and **database integration tests** (queue creation, duplicate prevention, transitions, GridFS, sender behaviour with a mocked Gmail client, history filters, dashboard totals, rate limiter). The integration tests run when a MongoDB is reachable at `MONGODB_URI` (default `mongodb://127.0.0.1:27017`, database `jaa_test`, which they **drop**) and are skipped otherwise.
- End-to-end smoke test of a running build:
  ```bash
  npm run build && npm start &
  BASE_URL=http://localhost:3000 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' node scripts/smoke-test.mjs
  ```
  It uses your real database. It creates a few test records and trips the login rate limiter at the end (wait ~15 minutes before re-running). Use a throwaway database.

Live Gmail sending requires your own Google credentials and is **not** covered by automated tests. Gmail is always mocked in tests.

## Production deployment

Use any host that runs Node.js servers (Render, Railway, Fly.io, a VPS, Docker, or Vercel). A static export will not work because the app needs API routes, OAuth and MongoDB.

1. Use MongoDB Atlas (or another real MongoDB reachable from the host).
2. Set every variable from `.env.example` in the host's dashboard. `APP_URL` and `GOOGLE_REDIRECT_URI` must use your real **https** domain.
3. Add `https://YOUR-DOMAIN/api/gmail/callback` to the OAuth client's authorized redirect URIs.
4. Build and start: `npm ci && npm run build && npm start` (Node 20.9+; the port comes from `PORT`).
5. Create the administrator once: `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin` (with the production `MONGODB_URI`).
6. Check `GET /api/health` returns `{"ok":true}`.

Notes:
- Sending is driven by the browser calling `/api/queue/process`, a few emails per call (each call is time-boxed under 60 s). This works on serverless hosts and needs no background worker. Keep the Review queue tab open while a batch is sending; if you close it, approved emails simply wait.
- Behind a reverse proxy, make sure it sets `X-Forwarded-For` (rate limiting is per client IP).
- Cookies are `HttpOnly`, `SameSite=Lax` and `Secure` (with the `__Host-` prefix) in production, so serve the site over HTTPS only.

## Security model

- **Single private user.** No public registration. Password hashed with bcrypt. Login is rate limited per IP and per email.
- **Server-side authorization** on every API route (`route()` wrapper), scoped by `userId`. The `proxy.ts` redirect is a convenience, not the boundary.
- **Sessions:** signed JWT in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie (7 days).
- **CSRF:** `SameSite` cookies plus an `Origin` check on every non-GET API request.
- **OAuth:** `state` and PKCE (S256) stored in a short-lived signed cookie bound to your session; callback validates both.
- **Gmail tokens:** refresh and access tokens are encrypted with AES-256-GCM before they reach MongoDB, are never returned by any API, and never reach the browser. All Gmail calls happen on the server. Disconnecting revokes the token with Google.
- **Input validation:** Zod on every endpoint; header-injection protection in the MIME builder; regex search input is escaped.
- **Uploads:** PDFs only, extension + `%PDF-` magic bytes + 10 MB limit; stored privately in GridFS; downloaded only through an authenticated endpoint with `Cache-Control: no-store`. Resume URLs are never public.
- **Rate limits** are stored in MongoDB, so they hold across multiple server instances.
- **No secrets in the repo or the client bundle.** `.env` is git-ignored.

## Sending limits and Gmail policy

- Default cap is **100 emails/day**, a configurable *application-level* limit (Settings). It is **not a guarantee** that Google will allow that many; Gmail enforces its own limits, which are lower for new or low-reputation accounts. The app never tries to bypass them.
- The cap counts emails sent today in your configured time zone and resets at local midnight.
- Emails go out one at a time with a configurable pause. Temporary errors (HTTP 5xx) are retried with backoff, up to your configured retries. A successful send is never retried.
- **HTTP 429, quota or restriction errors stop the run** and pause sending (until the next day for quota errors, briefly for rate limits, 24 h for account restrictions). Emails stay approved and are not lost. Use *Resume sending* in Settings after checking your account.
- An authentication error (revoked access) marks Gmail as needing reconnection and keeps emails queued.
- **Ambiguous outcomes are never auto-retried.** If a network timeout or a crash happens mid-send, Gmail may or may not have delivered the message, so the item is marked *Failed* with a note to check your Sent folder before retrying manually.
- Duplicate protection: one application per recipient (unique index), no duplicate recipients within a batch, and an atomic `approved → sending` claim so the same email can't be sent by two workers.
- Only send relevant, genuine applications. Don't use this for bulk unsolicited email.

## Extending: future automation

The intended pipeline is **Job discovery → Matching → Contact extraction → Draft generation → Review queue → User approval → Gmail**. `src/lib/automation/pipeline.ts` defines the interfaces (`JobSource`, `JobMatcher`, `ContactExtractor`) and `enqueueForReview()`, which renders drafts from a saved template and inserts them as `pending_review`. It cannot approve or send, so any future module is structurally unable to send without you. Candidate profile fields (skills, roles, locations) are already stored for matching and AI personalization. An optional AI personalization step can be added as a draft transformer before `createQueueItems`, without changing the queue, sender or UI. Use only permitted sources; don't scrape sites against their terms (e.g. LinkedIn).

## Known limitations

- **Live Gmail sending is untested here.** Everything up to the Gmail HTTP call is tested, including MIME output, token handling and error classification, with Gmail mocked. Verify with one real email to yourself after connecting.
- OCR accuracy depends on screenshot quality. Always check the extracted address before adding it; you can edit or add it by hand.
- The first OCR run needs internet access (engine download) unless you self-host the language data.
- Plain-text emails only (no HTML body or inline images).
- Single user and a single connected Gmail account.
- Sending proceeds while the Review queue page is open (see Production deployment notes).
- No automated browser (UI) tests; the UI was verified through build, type-check, lint and the HTTP smoke test.
