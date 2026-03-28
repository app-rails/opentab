# External Integrations

**Analysis Date:** 2026-03-28

## APIs & External Services

**Authentication:**
- Better Auth - Custom auth implementation with anonymous session support
  - SDK: `better-auth` 1.5.6
  - Endpoint: `/api/auth/*` routed at `app-server/src/app.ts`
  - Features: Anonymous login, Bearer token sessions

## Data Storage

**Databases:**
- SQLite (file-based)
  - Location: `app-server/data/auth.db`
  - Client: `better-sqlite3` 12.8.0
  - Purpose: User accounts, sessions, and auth state
  - Connection: Direct file access via `new Database("./data/auth.db")` in `app-server/src/auth.ts`

**Client-Side Storage:**
- IndexedDB (via Dexie)
  - Client: `dexie` 4.3.0
  - Location: Browser's IndexedDB (not file-based)
  - Purpose: Local data persistence in extension at `app-extension/src/stores/app-store.ts`

**File Storage:**
- Local filesystem only - No cloud storage integration
- Browser extension uses browser local storage APIs

**Caching:**
- None - No explicit caching layer (Dexie provides local persistence)

## Authentication & Identity

**Auth Provider:**
- Custom via Better Auth
  - Implementation: Anonymous auth plugin with Bearer token support
  - Session endpoints:
    - `POST /api/auth/sign-in/anonymous` - Creates anonymous session and returns token
    - `GET /api/auth/get-session` - Retrieves current session via Bearer token
  - Details: `app-server/src/auth.ts`, tested in `app-server/src/__tests__/auth.test.ts`

**Session Management:**
- Bearer token protocol
  - Token set in `set-auth-token` response header or response body
  - Validated via `Authorization: Bearer <token>` header
  - Token stored in extension state via `signInAnonymous()` call in `app-extension/src/lib/api.ts`

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Console logging only
- Server startup message to stdout: `console.log()` in `app-server/src/index.ts`
- Health check endpoint: `GET /api/health` returns `{ status: "ok", timestamp: number }`

## CI/CD & Deployment

**Hosting:**
- Not configured - Development only
- Server runs on `http://localhost:3001` by default
- Extension runs in browser with configurable API base via `VITE_API_BASE`

**CI Pipeline:**
- Not detected - No GitHub Actions, GitLab CI, or other CI configuration

## Environment Configuration

**Required env vars:**
- `BETTER_AUTH_SECRET` - Secret key for auth encryption (validated as required in `app-server/src/env.ts`)

**Optional env vars:**
- `BETTER_AUTH_URL` - Base URL for auth service (defaults to `http://localhost:3001`)
- `TRUSTED_ORIGINS` - Comma-separated CORS origins for server
- `TRUSTED_EXTENSION_ORIGINS` - Comma-separated CORS origins for extension
- `VITE_API_BASE` - API base URL for extension client (defaults to `http://localhost:3001`)

**Secrets location:**
- `.env` file at project root (git-ignored, see `.gitignore` line 10)
- Not committed to version control

**Test Secrets:**
- `vitest.config.ts` sets test-only env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## API Communication

**Extension to Server:**
- Base URL: `import.meta.env.VITE_API_BASE ?? "http://localhost:3001"` in `app-extension/src/lib/api.ts`
- Methods:
  - Anonymous sign-in: `fetch POST /api/auth/sign-in/anonymous`
  - Health check: `fetch GET /api/health`
- Headers: `Content-Type: application/json`, `Authorization: Bearer <token>`
- CORS: Configured at `app-server/src/app.ts` with origin validation against `TRUSTED_ORIGINS`

**Cross-Origin Policy:**
- CORS middleware enforces origin checking
- Allows methods: GET, POST, OPTIONS
- Allows headers: Content-Type, Authorization
- Credentials: Enabled

---

*Integration audit: 2026-03-28*
