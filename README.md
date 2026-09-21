# Gamyform

A self-hosted, desktop-first form studio with a stationary first-person 3D experience. Visitors shoot choices, adjust numbers with +/− targets, and type using a shootable keyboard or their physical keyboard. Every shot is a UI interaction; only the final **Send my answers** button submits a response.

## Run your workspace

Requires **Node.js 24** and npm. No paid form-builder service is required.

```bash
npm ci
npm run setup
npm run dev
```

Open **http://localhost:3000**. Setup asks for a password without echoing it, hashes it with bcrypt and writes the local `.env`. Never commit that file. The public `/demo` works without an owner login and never saves responses.

1. Sign in → **Create a form** → describe your form and generate, or use the clearly labelled editable sample.
2. Edit questions, options, required flags, number limits, contact mapping and completion text.
3. **Save** keeps a draft. **Preview** uses the draft without recording a response.
4. **Publish** creates a new immutable version and opens a shareable `/f/:slug` URL.
5. Responses appear in **Responses**, with detail view, deletion and CSV export.

Published forms continue serving their last published version when their draft is edited. Existing visitors can finish the version they opened. Closing a form blocks new submissions; an exact retry of an already accepted submission still returns its original receipt.

## Controls

Use a current desktop browser with WebGL 2 and pointer lock. The first click starts the experience; the practice target never records an answer. Move the mouse to look around; left click fires. The character cannot walk. Single-choice targets select and advance after a short feedback delay. Number fields use +/− and a separate confirmation target. The virtual keyboard has letters, digits, email punctuation, spaces, backspace and caps, including č/š/ž. Physical typing is available from **Type**. **Esc** releases the pointer and opens pause controls; recenter, sound volume, reduced motion and standard mode are available there. There are no timers, scores, ammunition limits or penalties.

A classic keyboard-accessible form uses the same question schema and answer state. Unsupported WebGL or pointer lock offers this fallback. Mobile gameplay is outside this MVP.

## Optional AI drafts

Set both values in `.env`, then restart:

```dotenv
AI_API_KEY=your_server_side_openai_key
AI_MODEL=your_chat_completions_model
```

The model must support Chat Completions JSON-object output and `max_completion_tokens`. The key stays on the server. Only the creator's brief is sent to the AI provider; submitted contact responses are not sent. The generated definition is validated, repaired once if needed, and remains an editable draft. When no key/model is configured, AI drafting is disabled and the sample/manual route remains available. No simulated AI output is shown.

## Data and production

Local development uses a persistent **PGlite PostgreSQL** database in `./data/postgres`. It is not browser storage. Keep the complete `data` directory across restarts. Use only one app process with this embedded database.

For a regular PostgreSQL server set `DATABASE_URL`. The same parameterized SQL is used by the `pg` driver. Use a connection URL supplied by your database provider, with the provider's recommended TLS settings. Hosted PostgreSQL has not been exercised in this build environment.

```bash
npm run build
# .env: APP_ORIGIN=https://your-real-domain.example
npm start
```

Serve through an HTTPS reverse proxy and set **APP_ORIGIN to the exact external origin** (no trailing slash). Owner mutations enforce this origin and a secure HttpOnly session cookie. Never expose the development server as production. Production refuses to start without an origin and password hash. Changing the origin requires a restart.

A Docker image is included:

```bash
docker build -t gamyform .
docker run --env-file .env -p 3000:3000 -v gamyform-data:/app/data gamyform
```

Use a persistent volume or an external PostgreSQL database. An ephemeral/serverless filesystem will lose the embedded database; use `DATABASE_URL` there and adapt the Node server entry to that platform's runtime. No hosting project, domain or external database is automatically provisioned. Back up the database before real collection; in embedded mode stop the process before copying the data directory. Restore the whole directory, not individual files.

### Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | Listen port, default 3000 |
| `APP_ORIGIN` | Exact public origin; default local development origin |
| `OWNER_PASSWORD_HASH` | bcrypt hash created by setup; never the plaintext password |
| `DATA_DIR` | Embedded database directory, default `./data` |
| `DATABASE_URL` | Optional external PostgreSQL connection |
| `AI_API_KEY`, `AI_MODEL` | Optional real AI generation |

Sessions expire after 12 hours. Owner and submission routes have in-process rate limits; multiple replicas need shared rate limiting. Sessions, forms, versions, submissions and minimal pseudonymous funnel events are stored server-side. There is no email sending, CRM sync, billing, team access or import in this version. Font files currently load from Google Fonts with system-font fallbacks; self-host these before deployments that require no third-party font requests.

## Verification

```bash
npm test
npm run build
```

See [the verification record](docs/verification.md) for what was actually tested and remaining manual checks. In particular, this environment's cloud browser lacks WebGL: visual 3D, pointer-lock aiming and perceived audio quality still require a real desktop device test before calling this production-ready.

## Architecture and source reuse

- React + Vite + TypeScript; React Hook Form and shared Zod definitions.
- Three.js + React Three Fiber, raycast targets and procedural 3D geometry. No image pretending to be a 3D game.
- Fastify API, bcrypt owner login, PostgreSQL-compatible storage, immutable publishing, idempotent submission retries and formula-safe CSV.
- Original synthesized Web Audio effects; no licensed game assets or sound downloads.
- Selected code adapted from **Hasan Harman's MIT form-builder**, pinned to a specific commit, with original source and license preserved. See [upstream provenance](docs/upstream-provenance.md).

The source is in your repository and runs on your infrastructure. The selected donor is an attributed code foundation, not a hosted service dependency.

Full product intent and future scope: [MVP + full vision](docs/product-spec.md). Current implementation and limitations take precedence over aspirational features in that document.
