# apps/cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the full-stack rebuild described in
`docs/superpowers/specs/2026-04-24-apps-cloud-design.md` — remove legacy
`apps/server` + `apps/web` + `packages/{api,auth,db}`, bring up `apps/cloud`
(RR7 + Cloudflare Workers + D1 + Better Auth), ship extension setup wizard
and server sync, land read-only and editable Web surfaces.

**Architecture:** Single RR7 Worker at `apps/cloud/` backs both the extension
sync API and the Web UI. Extension keeps its existing local-first Dexie
pipeline, gains a setup wizard + fetch-based sync client. Shared wire schemas
live in `packages/protocol`. Cloudflare D1 holds all correctness-critical
state; KV holds only Better Auth session cache. Identity split: Better Auth
for Web users, opaque long-lived `deviceToken` for extension sync.

**Tech stack:** React Router v7, Cloudflare Workers + D1 + KV, Better Auth,
Drizzle ORM, WXT, Dexie, XState, Zod, Biome, pnpm + turbo, lefthook,
commitlint.

**Spec sections referenced throughout:** Decision snapshot (§0.4), Phase 0
scope (§1.1–1.4), Phase 1 data model (§2.2), protocol (§2.3), server (§2.4),
extension (§2.5), Web read-only (§2.6), acceptance (§2.7–2.9), Phase 2 Web
editing (§3), appendices A and B.

**Plan structure:** One continuous task list, grouped by area. Each task
states its files, a terse description, and **acceptance criteria** — the
observable conditions that prove the task is done. Implementation code is
referenced by spec section, not duplicated here, except where the wire or
data contract is load-bearing.

**Definition of done for the whole plan:**

- Every acceptance scenario in spec §2.7 (A–D) and §3 passes manually
- Automated gate green: all `pnpm {lint, check-types, build, test}`,
  `grep -c "FOREIGN KEY" apps/cloud/drizzle/migrations/*.sql` returns 0,
  curl handshake script passes
- `apps/cloud` deployed to a Cloudflare staging environment, scenario A
  reproduces there
- Legacy paths (`apps/server`, `apps/web`, `packages/{api,auth,db}`) absent
  from git
- Spec matches shipped implementation (no drift)

---

## Conventions

- Every task ends with a commit. Commit messages follow Conventional Commits;
  the exact message is stated per task.
- "Green" = command exits 0 and any documented assertions pass.
- "Reference spec §X.Y" means: implement per that spec section; if a detail
  is missing from spec, raise it with the user before fabricating.
- For the rare code block in this plan, treat it as a **contract** (API
  shape, schema columns) the implementer must honor — not a paste-in
  implementation.
- Tests are named in the task's acceptance block; the engineer writes them
  following the project's existing test patterns (vitest for both `apps/cloud`
  and `apps/extension`).

---

## Prerequisites

- [ ] **Task 0: Preflight**

Verify the environment. No code change; no commit.

**Acceptance:**
- `pwd` ends with `conductor/workspaces/opentab/baku`
- `git branch --show-current` prints `feat/cloud-server`
- `git status` shows a clean tree
- `test -d ~/code/github/app-rails/react-router-v7-better-auth` (if missing,
  `git clone https://github.com/foxlau/react-router-v7-better-auth.git` there)
- `pnpm install` at the repo root exits 0

---

## Group 1 — Repo cleanup and offline extension

Outcome: the monorepo no longer contains `apps/server` / `apps/web` / legacy
packages; the extension still builds, installs, and runs **purely offline**,
with the sync UI intentionally disabled.

- [ ] **Task 1: Introduce empty `packages/protocol`**

**Files:** create `packages/protocol/{package.json, tsconfig.json, src/index.ts}`.
**What:** Workspace package `@opentab/protocol`, only dep is `zod`, extends
`@opentab/config/tsconfig.base.json`. `src/index.ts` exports a placeholder
flag; real schemas land later.

**Acceptance:**
- `pnpm install` clean
- `pnpm --filter @opentab/protocol check-types && pnpm --filter @opentab/protocol lint` green

**Commit:** `chore: add empty packages/protocol workspace`

- [ ] **Task 2: Trim `packages/shared/src/types.ts`**

**What:** Reduce `AuthState` to the offline-only variant
(`{ mode: "offline"; localUuid: string }`). Remove any re-export from
`@opentab/api` or `@opentab/db`. Keep `HealthResponse` and any other
non-sync domain types that currently live in `packages/shared/src/types.ts`.
Note: entity types (`Workspace`, `TabCollection`, `CollectionTab`,
`ImportSession`) live in `apps/extension/src/lib/db.ts`, not in shared —
they're out of scope for this task.

**Acceptance:**
- `rg -n '@opentab/(api|db)' packages/shared/src` → no matches
- `pnpm --filter @opentab/shared check-types && pnpm --filter @opentab/shared lint` green

**Commit:** `refactor(shared): shrink AuthState to offline-only`

- [ ] **Task 3: Add stable `localProfileId` to the extension**

**Files:** create `apps/extension/src/lib/local-profile.ts`; modify the file
that resolves the local `accountId` (typically `resolve-account-id.ts`).
**What:** Per spec decision 23, add `getLocalProfileId()` that
(1) reads/writes `chrome.storage.local.opentab_local_profile_id_v1`,
(2) on first call with no stored value, adopts an existing id from either
raw `chrome.storage.local["opentab_auth"]?.localUuid` **or** the oldest
workspace's `accountId`, and (3) only falls through to a fresh UUID v7 if
both adoption paths yield nothing. Rewrite the account-id resolver to
delegate to this function.

Read the auth-storage key **raw** rather than via `getAuthState()` — this
keeps Task 3 decoupled from Task 4's later stub rewrite, and also handles
the pre-existing `{ mode: "online", localUuid: ..., ... }` shape that the
current repo has but the Task 2 / Task 4 stubs intentionally drop from the
type system. At runtime, historical online-mode storage still carries a
real `localUuid` string the adoption logic can salvage.

**Acceptance:**
- `pnpm --filter @opentab/extension check-types` green
- Unit test: adoption returns the existing `auth-storage` UUID when present;
  falls back to oldest workspace's `accountId`; only generates fresh when
  both are absent
- Manual: installing the extension into a Chrome profile with pre-existing
  Dexie data results in `opentab_local_profile_id_v1 == workspaces[0].accountId`
  (verified via DevTools); the UI still shows the existing workspaces

**Commit:** `feat(extension): add stable localProfileId with adoption from existing data`

- [ ] **Task 4: Stub out extension's legacy auth and tRPC modules; add `@opentab/protocol` dep**

**Files:** rewrite `apps/extension/src/lib/{trpc.ts, auth-manager.ts, auth-storage.ts}`
as offline-only stubs; remove `apps/extension/src/lib/api.ts` if present;
modify `apps/extension/package.json` to remove `@opentab/api` and
`@trpc/client` and **add `"@opentab/protocol": "workspace:*"`** (so later
Group 6 tasks can import UUID regex / schemas without another workspace
config change).
**What:** `trpc.ts` exports a `getExtensionTRPCClient` that throws. `auth-manager.ts`
synthesizes `{ mode: "offline", localUuid: await getLocalProfileId() }`.
`auth-storage.ts` keeps only the offline variant of `AuthState` and its
get/set/clear helpers.

**Acceptance:**
- `rg -n "@opentab/api|@trpc/client" apps/extension` → no matches
- `cat apps/extension/package.json | jq '.dependencies["@opentab/protocol"]'` prints `"workspace:*"`
- `pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension build && pnpm --filter @opentab/extension test` green

**Commit:** `refactor(extension): stub trpc/auth-manager/auth-storage and add @opentab/protocol dep`

- [ ] **Task 5: Disable extension sync startup and UI toggle**

**Files:** modify `apps/extension/src/entrypoints/background.ts` and the
component that renders the Enable Sync switch in settings.
**What:** Remove code paths that start the sync engine or set sync alarms.
Mark the Enable Sync toggle `disabled` with a tooltip "Syncing will return
in a future release". Retain all local CRUD paths.

**Acceptance:**
- Manual: loading the built extension in Chrome shows the Enable Sync
  toggle disabled; all local CRUD actions still work; background service
  worker DevTools console has zero red errors and zero failed network
  requests
- Extension unit tests continue to pass

**Commit:** `chore(extension): disable sync startup and Enable Sync toggle`

- [ ] **Task 6: Delete legacy packages and apps**

**Files:** `rm -rf apps/server apps/web packages/api packages/auth packages/db`.
**What:** After removal, refresh the pnpm lockfile; grep-scan for dangling
references.

**Acceptance:**
- `rg -n '@opentab/(server|web|api|auth|db)' apps packages pnpm-workspace.yaml turbo.json` → no matches
- `pnpm install` green; `pnpm lint` green; `pnpm --filter @opentab/extension build` green

**Commit:** `chore: remove legacy apps/server, apps/web, packages/{api,auth,db}`

- [ ] **Task 7: Milestone checkpoint — offline extension acceptance**

**Files:** none.
**What:** End-to-end manual walkthrough of the offline extension.

**Acceptance:**
- Install `apps/extension/.output/chrome-mv3/` in a fresh Chrome profile
- Tabs page renders
- Settings → Sync toggle disabled with tooltip
- Create a workspace, add tabs, delete a collection — all succeed
- Reload the extension; all local data persists
- Background worker console clean
- Evidence captured to `docs/superpowers/acceptance/offline-extension.md`

**Commit:** `docs: offline extension acceptance notes` (can be empty commit)

---

## Group 2 — `apps/cloud` scaffold import and monorepo wiring

Outcome: `apps/cloud/` exists as a RR7 Cloudflare Worker, pruned of scaffold
features we don't want, wired into the monorepo's shared tooling, with a
working local dev server and Better Auth flows.

- [ ] **Task 8: Copy scaffold tree into `apps/cloud`**

**What:** `rsync -a` the scaffold into `apps/cloud/`, excluding
`.git / node_modules / .wrangler / .react-router / pnpm-lock.yaml`. Delete
files the monorepo root owns (`biome.json`, `lefthook.yml`,
`commitlint.config.cjs`). Delete demo and R2-dependent surfaces
(`app/routes/todos.tsx`, `images.ts`; `app/components/todos/**`;
`app/components/ui/cropper.tsx`; `app/components/user/avatar-cropper.tsx`,
`avatar-selector.tsx`; `app/services/r2.server.ts`;
`app/lib/validations/todo.ts`; `drizzle/schema/todo.ts`; all of
`drizzle/migrations/`).

**Acceptance:**
- `ls apps/cloud` shows `app/`, `drizzle/`, `public/`, `workers/`,
  `package.json`, `react-router.config.ts`, `vite.config.ts`,
  `drizzle.config.ts`, `tsconfig.json`, `wrangler.jsonc.example`
- None of the deleted paths above exist

**Commit:** `feat(cloud): import RR7 scaffold into apps/cloud, minus demos and R2`

- [ ] **Task 9: Apply scaffold code deltas**

**Files:** modify `apps/cloud/app/services/auth/auth.server.ts`,
`app/services/env.server.ts`, `drizzle/schema/auth.ts`,
`drizzle/schema/index.ts`, `drizzle/seed/seed.ts`,
`app/components/settings/social-connection.tsx`,
`app/components/user/{user-avatar.tsx, user-nav.tsx}`,
`app/services/auth/client.ts` (only if it references R2).
**What:** Per spec decisions 5, 6, 7, 13:
- Auth config: drop Google social provider, drop the `deleteUser.afterDelete`
  R2 hook, drop the `google` entry from `accountLinking.trustedProviders`,
  keep admin / username / lastLoginMethod / customSession plugins. **Leave
  `trustedOrigins` temporarily set to `[baseURL, "http://localhost:4173"]`
  only** — Task 23 introduces the shared `allowlist-origins.ts` module that
  owns extension-origin enumeration, **and Task 23 itself wires `trustedOrigins`
  into it** so Better Auth and the callback allowlist share a single source of
  truth. Do **not** hardcode `chrome-extension://*` here.
- Env schema: remove `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Auth drizzle schema: remove every `.references(...)`; remove the
  `relations(...)` blocks and its import.
- Schema index: export only `./auth`.
- Seed: reduce to a single admin user (email `admin@example.com`,
  password `admin@8899`).
- UI: GitHub-only social connection; no avatar upload entry points.

**Acceptance:**
- `rg -n "google|Google|GOOGLE_CLIENT" apps/cloud` → only comments / docs,
  no active references
- `rg -n "deleteUserImageFromR2|r2\\.server|afterDelete" apps/cloud` → no matches
- `rg -n "\\.references\\(" apps/cloud/drizzle/schema` → no matches
- `pnpm --filter @opentab/cloud check-types` green

**Commit:** `refactor(cloud): drop Google OAuth, R2 avatars, todos; strip FKs from auth schema`

- [ ] **Task 10: Rewrite `routes.ts` and landing page**

**Files:** modify `apps/cloud/app/routes.ts` and `apps/cloud/app/routes/index.tsx`.
**What:** Strip routes list to auth / settings / admin / api(auth + theme-switcher) / not-found.
Landing loader redirects authenticated users to `/dash` and renders a short
marketing page otherwise (referencing the OpenTab extension install link as
a placeholder). Note: `/dash` is implemented in Group 8 — during this group,
an authenticated session redirects to a temporarily missing route; acceptable.

**Acceptance:**
- `pnpm --filter @opentab/cloud check-types` green
- Visiting `/` logged-out renders the OpenTab landing with sign-in / sign-up
  CTAs (verified in Task 13)

**Commit:** `feat(cloud): OpenTab landing page; prune routes.ts to current surface`

- [ ] **Task 11: Wire `apps/cloud` into monorepo tooling**

**Files:** rewrite `apps/cloud/package.json` (name `@opentab/cloud`; add
dep `@opentab/protocol` and dev dep `@opentab/config`; drop
`@origin-space/image-cropper`, `boring-avatars`, `drizzle-seed`,
`@biomejs/biome`, `@commitlint/*`, `lefthook`; keep `@tanstack/react-table`,
`@conform-to/*`, radix / tailwind / drizzle); overwrite
`apps/cloud/tsconfig.json` to extend `@opentab/config/tsconfig.base.json`.
Update root `turbo.json` to add `@opentab/cloud#build / #dev / #deploy`
pipeline entries. Add root `package.json` scripts:
`cloud:dev, cloud:build, cloud:deploy, cloud:db:generate, cloud:db:migrate:local, cloud:db:seed:local, ext:dev`.

**Acceptance:**
- `pnpm install` green
- `pnpm --filter @opentab/cloud {check-types, lint}` green
- `pnpm lint` green repo-wide

**Commit:** `chore(cloud): wire apps/cloud into monorepo tooling`

- [ ] **Task 12: Normalize formatting**

**What:** scaffold uses tab indentation; monorepo uses 2 spaces. Run
`pnpm format` across the repo.

**Acceptance:**
- `git diff --stat apps/cloud` before commit: whitespace-only changes

**Commit:** `style(cloud): normalize indentation to 2 spaces via Biome`

- [ ] **Task 13: Configure wrangler + local D1 + KV**

**Files:** create `apps/cloud/wrangler.jsonc` from the scaffold's
`.example`; create `apps/cloud/.dev.vars` (gitignored).
**What:** Name the worker `opentab-cloud`; bindings `DB` (D1) and `APP_KV`
(KV). Run `wrangler d1 create opentab-cloud` and `wrangler kv namespace create APP_KV`,
paste returned IDs into `wrangler.jsonc`. Fill `.dev.vars` with
`APP_ENV=development`, real `BETTER_AUTH_SECRET`, dev GitHub OAuth app
credentials, and a placeholder `BETTER_AUTH_ADMIN_USER_ID` that gets
updated after Task 14.

**Acceptance:**
- `cat apps/cloud/wrangler.jsonc | jq -e '.d1_databases[0].database_id != "PLACEHOLDER_CREATE_AFTER_RUN"'` (or equivalent; real ID present)
- `.dev.vars` contains `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` with
  non-placeholder values OR a documented decision to skip the GitHub OAuth
  acceptance step

**Commit:** `feat(cloud): configure D1 + KV bindings; template .dev.vars`

- [ ] **Task 14: Regenerate FK-free baseline migration; seed admin**

**What:** Confirm `apps/cloud/drizzle/migrations/` does not exist (Task 8
removed it); if for any reason it does, delete it before proceeding.
`pnpm --filter @opentab/cloud db:generate` emits a fresh `0000_*.sql`.
Apply with `db:migrate:local`, then `db:seed:local`. Capture the seeded
admin user id into `.dev.vars` as `BETTER_AUTH_ADMIN_USER_ID`.

**Acceptance:**
- `grep -c "FOREIGN KEY" apps/cloud/drizzle/migrations/0000_*.sql` → `0`
- `db:migrate:local` and `db:seed:local` both exit 0
- `.dev.vars` `BETTER_AUTH_ADMIN_USER_ID` is the seeded user's real id

**Commit:** `feat(cloud): regenerate FK-free baseline migration and seed admin`

- [ ] **Task 15: Milestone checkpoint — cloud boots and auth works**

**What:** Manual walkthrough of the scaffold-only capabilities.

**Acceptance:**
- `pnpm cloud:dev` starts; landing at http://localhost:5173 renders OpenTab
- Sign-up with new email → verification URL in dev console → sign-in works
- Sign-in as `admin@example.com` / `admin@8899` works
- `/settings/{account, appearance, password, sessions, connections}` all
  function; connections shows GitHub only, not Google
- Forget-password flow logs a reset URL in console; reset succeeds
- `/admin` as admin shows dashboard and users grid; as non-admin, denied
- `/todos` → 404
- GitHub OAuth end-to-end works (only if dev OAuth app credentials are set;
  otherwise document skip)
- Evidence captured to `docs/superpowers/acceptance/cloud-baseline.md`

**Commit:** `docs: cloud scaffold acceptance notes` (can be empty commit)

---

## Group 3 — Shared wire schemas (`packages/protocol`)

Outcome: the protocol package defines all request / response schemas shared
between server and extension. Semver-based compatibility window. UUID v7
strict.

- [ ] **Task 16: Define protocol constants**

**Files:** `packages/protocol/src/{version.ts, constants.ts}`.
**What:** Implement spec §2.3. Constants cover `PROTOCOL_VERSION` (read from
the package's own `version` field via an import attribute), strict
`UUID_V7_REGEX`, `MAX_BATCH_SIZE`, payload length limits (`url.max(500)`,
`title.max(500)`, `name.max(100)`).

**Acceptance:**
- Unit tests assert UUID v7 regex matches sample v7 strings and rejects v4
- `PROTOCOL_VERSION` equals the current `package.json.version`

**Commit:** `feat(protocol): define protocol version and constants`

- [ ] **Task 17: Define entity payload schemas and `PushOp` union**

**Files:** `packages/protocol/src/{entities.ts, ops.ts}`.
**What:** Per-entity create/update/delete payload schemas. Discriminated
`PushOp` union with nine variants keyed on `kind`. Cross-field invariant
(`payload.syncId === entitySyncId`) is documented as enforced server-side,
not inside zod.

**Acceptance:**
- Unit tests for each variant: valid payload parses; invalid length /
  missing field / malformed UUID rejected
- `rg -n 'payload.syncId' packages/protocol/src` confirms no attempted
  cross-field validation inside zod

**Commit:** `feat(protocol): add entity payloads and PushOp discriminated union`

- [ ] **Task 18: Define endpoint request/response schemas and error codes**

**Files:** `packages/protocol/src/endpoints/{health, push, pull, snapshot, exchange-consume}.ts`,
`packages/protocol/src/errors.ts`.
**What:** Health response carries the four version fields (spec decision 17).
Push request has **no** `deviceId` field. Push response has first-class
`applied[] / duplicates[] / lwwSkipped[]` and optional `error` (spec
decision 19). Pull response includes `resetRequired: boolean` (hardcoded
false in Phase 1). Snapshot includes soft-deleted entities. Error codes per
spec §2.3.

**Acceptance:**
- Unit tests cover each response schema with a fixture
- Unit test: push request with a `deviceId` field **strips** it after parse
  (zod object default behavior is strip; fixture fails if configured with
  `.strict()`)

**Commit:** `feat(protocol): define endpoint schemas and error codes`

- [ ] **Task 19: Barrel + consumer smoke**

**Files:** `packages/protocol/src/index.ts` re-exports everything; ensure
tree-shakable named exports.
**What:** Re-export from `./version, ./constants, ./entities, ./ops, ./endpoints/*, ./errors`.

**Acceptance:**
- `pnpm --filter @opentab/protocol {check-types, lint, test}` green
- `apps/cloud` and `apps/extension` both already have `@opentab/protocol`
  as a dep (extension added in Task 4; cloud added in Task 11) and a
  type-only smoke import compiles

**Commit:** `feat(protocol): barrel exports`

---

## Group 4 — Server: D1 schema + migrations

Outcome: the D1 schema contains users + accounts + verifications + sessions
(from scaffold, FK-free) plus the seven new tables required by sync and the
setup exchange. Baseline migration regenerated.

- [ ] **Task 20: Add Drizzle schemas for sync tables; add `uuid` dep to apps/cloud**

**Files:** create `apps/cloud/drizzle/schema/{sync-workspaces, sync-tab-collections, sync-collection-tabs, sync-applied-logs, sync-change-logs, sync-devices, extension-setup-exchanges}.ts`;
update `apps/cloud/drizzle/schema/index.ts` to export them all; modify
`apps/cloud/package.json` to add `"uuid": "^10"` and `"@types/uuid": "^10"`
(server will need `uuidv7()` for exchange `id` and any other server-generated
v7 ids).
**What:** Per spec §2.2. Columns per table documented below; engineer writes
Drizzle SQLite declarations matching these columns exactly. **No foreign
keys anywhere.** Column naming: snake_case in DB, camelCase in Drizzle
property names. Timestamps `timestamp_ms` mode.

Column contracts (spec §2.2; treat as binding):

- `workspaces`: `id` int PK auto, `syncId` text, `userId` text, `name`, `icon`,
  `viewMode`, `order`, `lastOpId` text default `""`, `deletedAt` ms nullable,
  `createdAt` ms, `updatedAt` ms. Indexes: unique `(userId, syncId)`,
  index `(userId)`.
- `tab_collections`: add `workspaceSyncId` text. Same bookkeeping fields.
  Indexes: unique `(userId, syncId)`, index `(userId, workspaceSyncId)`.
- `collection_tabs`: add `collectionSyncId` text, `url`, `title`, `favIconUrl`.
  Indexes: unique `(userId, syncId)`, index `(userId, collectionSyncId)`.
- `sync_applied_logs`: id, userId, opId, appliedAt. Unique `(userId, opId)`.
- `sync_change_logs`: seq int PK auto, userId, entityType, entitySyncId,
  action, opId, payload text (JSON), deviceId nullable text, createdAt.
  Index `(userId, seq)`.
- `devices`: id text PK (UUID v7), userId, name, platform nullable, extensionVersion nullable,
  tokenHash text unique, createdAt ms, lastSeenAt ms, revokedAt ms nullable.
  Index `(userId)`.
- `extension_setup_exchanges`: id text PK (UUID v7), codeHash text unique,
  userId text, nonce, callbackUrl, deviceName / platform / extensionVersion,
  expiresAt, consumedAt nullable, createdAt. Indexes `(userId)` and `(expiresAt)`.

**Acceptance:**
- `rg -n '\\.references\\(' apps/cloud/drizzle/schema` → no matches
- `pnpm --filter @opentab/cloud check-types` green

**Commit:** `feat(cloud): add drizzle schemas for sync, devices, and setup exchange`

- [ ] **Task 21: Generate and inspect migration `0001`**

**What:** `pnpm --filter @opentab/cloud db:generate` emits
`apps/cloud/drizzle/migrations/0001_*.sql`. Review the SQL before committing.

**Acceptance:**
- `grep -c "FOREIGN KEY" apps/cloud/drizzle/migrations/0001_*.sql` → `0`
- Migration contains `CREATE TABLE` for all 7 new tables with the expected
  columns and indexes
- `db:migrate:local` exits 0

**Commit:** `feat(cloud): generate Phase 1 baseline migration for sync tables`

---

## Group 5 — Server: auth, middleware, services, endpoints

Outcome: `/api/health`, `/api/sync/{push,pull,snapshot}`, `/api/extension/exchange/consume`,
`/connect/extension` are live; device-token middleware resolves identity
server-side; protocol-version middleware enforces the compatibility window
mirrored from `/api/health`; rate limit via KV.

- [ ] **Task 22: Implement shared compat-window constants and `/api/health`**

**Files:** `apps/cloud/app/services/protocol-compat.server.ts`,
`apps/cloud/app/routes/api/health.ts`.
**What:** Export server-side constants `PROTOCOL_VERSION` (from
`@opentab/protocol`), `MIN_SUPPORTED_PROTOCOL_VERSION`,
`MIN_SUPPORTED_EXTENSION_VERSION`, `RECOMMENDED_EXTENSION_VERSION`.
Health handler returns these plus `serverVersion` (from `apps/cloud/package.json`),
`serverTime`, `timezone`. Both the handler and the middleware in Task 24
import from this single module.

**Acceptance:**
- `curl http://localhost:5173/api/health | jq '.protocolVersion'` prints the
  package's version string
- Unit test: response conforms to `healthResponseSchema`

**Commit:** `feat(cloud): add /api/health with compatibility window`

- [ ] **Task 23: Implement error helper, allowlist module, and wire into Better Auth**

**Files:** `apps/cloud/app/lib/sync-errors.ts`,
`apps/cloud/app/lib/allowlist-origins.ts`; modify
`apps/cloud/app/services/auth/auth.server.ts`.
**What:** `syncError(code, status, message?)` returns a typed JSON response.
`allowlist-origins.ts` exports `getExtensionOrigins()` that reads
environment: in dev it returns `["chrome-extension://*"]`; in prod it parses
`CHROMIUM_EXTENSION_IDS` into `chrome-extension://<id>` strings (per spec
Appendix B.3). It also exports `isAllowedCallback(origin)` for the exchange
callback validation. Wire Better Auth's `trustedOrigins` to consume the
same helper so the allowlist and `trustedOrigins` cannot drift:
`trustedOrigins: [baseURL, "http://localhost:4173", ...getExtensionOrigins()]`.

**Acceptance:**
- Unit test: `isAllowedCallback("chrome-extension://<any>/setup-callback.html")` returns true in dev
- Unit test: with `CHROMIUM_EXTENSION_IDS="abc123,def456"` set and
  `APP_ENV=production`, unknown extension IDs return false; enumerated IDs
  return true
- `rg -n "chrome-extension" apps/cloud/app/services/auth/auth.server.ts` →
  no matches (auth.server.ts must not hardcode extension origins; it only
  calls `getExtensionOrigins()`)

**Commit:** `feat(cloud): shared sync error helper and origin allowlist wired into trustedOrigins`

- [ ] **Task 24: Implement device-token and protocol-version middlewares**

**Files:** `apps/cloud/app/middlewares/{device-token, protocol-version, rate-limit}.ts`;
update `apps/cloud/app/middlewares/index.ts`.
**What:** `device-token` reads Bearer, hashes (`sha256Hex`), looks up the
`devices` row (filtering `revoked_at IS NULL`), returns `{ userId, deviceId, device }`.
`protocol-version` enforces the 3 rules of spec §2.4 (client protocol too
old; client extension too old; client major > server major), using the Task 22
constants. `rate-limit` is a KV token bucket per `(userId, endpoint)` /
`(ip, endpoint)`; returns 429 with `Retry-After`.

**Acceptance:**
- Unit tests cover: missing Bearer → 401 UNAUTHORIZED; hash miss → 401
  DEVICE_NOT_REGISTERED; revoked row → 401 DEVICE_NOT_REGISTERED; valid
  token → resolves identity
- Unit tests cover: missing protocol header → 426 API_VERSION_MISMATCH;
  protocol below min → 426; extension below min → 426; major mismatch → 426;
  in-window → passes through
- Unit test: rate-limit bucket depletes after N requests, refills after the
  window

**Commit:** `feat(cloud): device-token, protocol-version, and rate-limit middlewares`

- [ ] **Task 25: Implement sync repo (D1 access) with batch-first rule**

**Files:** `apps/cloud/app/services/{sync-repo.server.ts, devices-repo.server.ts, extension-setup-repo.server.ts}`.
**What:** Per spec §2.4. Function signatures: `applyPushOpTx`,
`listChangesSince`, `loadSnapshot`, `parentExists`, `touchDevice`,
`listDevicesForUser`, `revokeDeviceById`, `findDeviceByTokenHash`,
`insertExchange`, `consumeExchangeByCodeHash`,
`upsertDeviceByIdRotatingToken`. Every multi-statement path uses
`db.batch([...])`; no JOINs.

**Acceptance:**
- `rg -n 'innerJoin|leftJoin|fullJoin' apps/cloud/app/services` → no matches
- Unit tests:
  - `applyPushOpTx`: create wins, duplicate opId returns `duplicate`, LWW
    loses returns `lww-skip`, update to nonexistent returns `lww-skip`
    (never auto-creates), syncId mismatch → error, cross-user parent → error
  - `consumeExchangeByCodeHash`: first call OK; replay returns null
    (atomic, tested under concurrency by calling twice sequentially within
    a manual transaction simulation)
  - `findDeviceByTokenHash`: revoked row filtered out

**Commit:** `feat(cloud): sync / devices / exchange repositories`

- [ ] **Task 26: Implement sync and devices services**

**Files:** `apps/cloud/app/services/{sync.server.ts, devices.server.ts, extension-setup.server.ts}`.
**What:** Service layer that consumes already-parsed zod inputs, performs
cross-field validation (payload.syncId, parent ownership), delegates to
repo, updates `lastSeenAt` at the end of every sync call. Exchange service
exposes `createExchange` (cookie-authed caller) and `consumeExchange`
(public caller). Devices service exposes `listDevices` and `revokeDevice`.

**Acceptance:**
- Unit test: `pushOps` with 5 ops, 3rd op errors → response has 2 applied,
  ops 4–5 unprocessed
- Unit test: `pushOps` classifies `applied / duplicates / lwwSkipped` into
  the correct buckets on the response
- Unit test: `consumeExchange` on a consumed code returns
  `EXCHANGE_INVALID`

**Commit:** `feat(cloud): sync, devices, and exchange service layer`

- [ ] **Task 27: Implement sync endpoints**

**Files:** `apps/cloud/app/routes/api/sync/{push, pull, snapshot}.ts`.
**What:** Thin adapters: parse with `pushRequestSchema` etc., apply
`requireProtocolVersion` and `requireDeviceToken`, call services, return
json.

**Acceptance:**
- `curl` (authenticated with a seeded test device) POST to `/api/sync/push`
  with a single create-workspace op returns `applied: [opId], duplicates: [], lwwSkipped: [], error: null`
- Replayed push returns `duplicates: [opId]`
- GET `/api/sync/pull?cursor=0` returns the recent change
- GET `/api/sync/snapshot` returns the single workspace

**Commit:** `feat(cloud): /api/sync/{push,pull,snapshot} endpoints`

- [ ] **Task 28: Implement exchange consume endpoint and `/connect/extension`**

**Files:** `apps/cloud/app/routes/api/extension/exchange/consume.ts`,
`apps/cloud/app/routes/connect/extension.tsx`.
**What:** Consume endpoint validates `exchangeConsumeRequestSchema`, calls
`consumeExchange` service, returns `{ deviceId, deviceToken, user }`.
`/connect/extension` is a cookie-authenticated RR7 page: shows the target
device name and host; on approve, action calls `createExchange` service
and redirects to `${callbackUrl}?exchange_code=...&nonce=...`; rate-limited.

**Acceptance:**
- Manual: logged-in user hitting `/connect/extension?nonce=...&callback_url=...`
  sees the approve UI; approve triggers a 302 with `exchange_code` and
  `nonce` in the Location header
- Curl `POST /api/extension/exchange/consume` with a valid code +
  deviceId succeeds; replay returns 409 `EXCHANGE_INVALID`
- Curl with unknown `callback_url` origin at create returns 400
  `INVALID_PAYLOAD`

**Commit:** `feat(cloud): one-time exchange handoff endpoints`

- [ ] **Task 29: Update `routes.ts` for new routes**

**Files:** modify `apps/cloud/app/routes.ts`.
**What:** Add declarations for the new api and connect routes; `/dash` and
`/devices` are declared in Group 8.

**Acceptance:**
- All Task 27 and Task 28 `curl` checks still route correctly

**Commit:** `feat(cloud): declare Phase 1 server routes`

- [ ] **Task 30: Milestone checkpoint — server handshake end to end via curl**

**What:** Run the curl handshake script captured in `apps/cloud/scripts/handshake-smoke.sh`
(engineer writes it in this task): sign in → POST `/connect/extension` approve →
extract exchange_code → POST `/api/extension/exchange/consume` → POST
`/api/sync/push` (sample fixture) → GET `/api/sync/pull?cursor=0` →
replay consume returns 409.

**Acceptance:**
- Script exits 0 with all intermediate assertions green
- Script checked in

**Commit:** `test(cloud): handshake smoke script`

---

## Group 6 — Extension: sync client + Dexie v5 + auth storage

Outcome: Extension has a new fetch-based sync client, v5 Dexie schema with
UUID v7, persisted device identity, and auth-storage for the
`deviceToken`-based authenticated state.

- [ ] **Task 31: Dexie v5 migration (UUID v4 → v7); add `uuid` dep**

**Files:** create `apps/extension/src/lib/dexie-migrations/v5-uuid-v7.ts`;
modify `apps/extension/src/lib/db.ts`; modify
`apps/extension/package.json`.
**What:** Add `"uuid": "^10"` and `"@types/uuid": "^10"` to the extension's
dependencies. v5 upgrade re-generates every `syncId` and `opId` as UUID v7
(via `import { v7 as uuidv7 } from "uuid"`), updates child tables' parent
references via an in-memory map, clears any pre-existing sync cursor.

**Acceptance:**
- Unit test: pre-populated v4 DB, after upgrade, all entity `syncId` match
  `UUID_V7_REGEX`; every collection's `workspaceSyncId` points to the new
  workspace `syncId`; every tab's `collectionSyncId` points to the new
  collection `syncId`; `syncOutbox` rows' `entitySyncId`, `payload.syncId`,
  `payload.parentSyncId`, and `opId` are all updated

**Commit:** `feat(extension): Dexie v5 migration to UUID v7`

- [ ] **Task 32: Sync auth storage + persisted deviceId**

**Files:** `apps/extension/src/lib/sync-auth-storage.ts`,
`apps/extension/src/lib/sync-setup/device-identity.ts`.
**What:** `SyncAuthState` discriminated union (spec §2.5). `getSyncAuth /
setSyncAuth / clearSyncAuth` persist to `opentab_sync_auth_v1`. Device
identity: `getOrCreatePersistedDeviceId` persists to
`opentab_sync_device_id_v1` and returns UUID v7 (generated lazily, reused
forever).

**Acceptance:**
- Unit tests: round-trip set/get; disabled state is the default; device id
  is stable across calls; regex match UUID v7

**Commit:** `feat(extension): sync auth storage and persistent device id`

- [ ] **Task 33: Sync HTTP client**

**Files:** `apps/extension/src/lib/sync-client.ts`.
**What:** `SyncClient` class per spec §2.5: every request adds
`x-opentab-protocol-version` and `x-opentab-extension-version`; every response
is zod-parsed; 401 clears auth and broadcasts `SYNC_AUTH_REQUIRED`; 426
broadcasts `SYNC_PROTOCOL_MISMATCH`; no refresh retry.

**Acceptance:**
- Unit tests (fetch mocked): headers always present; 401 triggers
  `clearSyncAuth` and the right broadcast; 426 triggers the right broadcast;
  `push` returns the parsed response intact

**Commit:** `feat(extension): fetch-based sync client with zod parsing`

- [ ] **Task 34: Update `constants.ts` with new `MSG` keys**

**Files:** modify `apps/extension/src/lib/constants.ts`.
**What:** Per spec decisions 30 + Finding 1 from the plan reviews, add
`SYNC_SETUP_CALLBACK`, `SYNC_SETUP_COMPLETE`, `SYNC_DISCONNECTED`,
`SYNC_PROTOCOL_MISMATCH`. Existing `SYNC_AUTH_REQUIRED` is reused.

**Acceptance:**
- `rg -n 'SYNC_SETUP_CALLBACK|SYNC_SETUP_COMPLETE|SYNC_DISCONNECTED|SYNC_PROTOCOL_MISMATCH' apps/extension/src/lib/constants.ts`
  returns 4 matches

**Commit:** `feat(extension): add sync lifecycle message constants`

- [ ] **Task 35: Swap sync engine onto the new transport**

**Files:** modify `apps/extension/src/lib/sync-engine.ts`.
**What:** Replace tRPC calls with `SyncClient`. Adjust push result handling
to mark `applied ∪ duplicates ∪ lwwSkipped` as `synced` in the outbox, keep
the `error` op retryable. Remove `attemptRegistration` / online/offline
branching.

**Acceptance:**
- Existing sync-engine unit tests retargeted at the new client continue to
  pass: push → synced transition, retry on network error, LWW pull/apply,
  fullReset, self-echo skip
- New test: `lwwSkipped[]` ops get marked `synced` (not retried)

**Commit:** `refactor(extension): rewire sync-engine to new transport`

- [ ] **Task 36: Replace every `crypto.randomUUID()` call site in the extension with `uuidv7()`**

**Files:** modify every file that currently generates UUIDs via
`crypto.randomUUID()`. Confirmed call sites (run `rg -l 'crypto\.randomUUID' apps/extension/src`
before starting):
- `apps/extension/src/stores/app-store.ts` (~30 sites)
- `apps/extension/src/lib/sync-engine.ts`
- `apps/extension/src/lib/import/execute.ts`
- `apps/extension/src/lib/db.ts`
- `apps/extension/src/entrypoints/background.ts`
- `apps/extension/src/lib/auth-manager.ts` (already a Task 4 stub — double-check no
  live UUID generation remains here after Task 4's rewrite)

**What:** Replace every `crypto.randomUUID()` with `uuidv7()` from the `uuid`
package. `mutate-with-outbox.ts` itself has no UUID generation — it just
stores whatever its callers pass in; the wholesale switch happens at the
call sites.

**Acceptance:**
- `rg -n 'crypto\.randomUUID' apps/extension/src` → 0 matches
- Every changed file also adds the import `import { v7 as uuidv7 } from "uuid";`
- Unit test (updated from Task 35): a `mutateWithOutbox` round-trip produces
  an outbox row whose `opId` and `payload.syncId` both match `UUID_V7_REGEX`
- `pnpm --filter @opentab/extension {check-types, lint, test, build}` green

**Commit:** `feat(extension): generate UUID v7 at every id production site`

---

## Group 7 — Extension: setup wizard + callback bridge + background

Outcome: User can run the wizard end-to-end to reach the `authenticated`
state and pick upload or download.

- [ ] **Task 37: Callback entrypoint + `web_accessible_resources`**

**Files:** `apps/extension/src/entrypoints/setup-callback/{index.html, main.ts}`,
update `apps/extension/wxt.config.ts`.
**What:** WXT HTML entrypoint (MV3-CSP-compliant: external module script,
no inline). `main.ts` reads `exchange_code / nonce / error` from query,
writes durably to `chrome.storage.local.opentab_pending_setup_callback_v1`,
sends `SYNC_SETUP_CALLBACK` runtime message, shows "Authorization complete",
auto-closes via `chrome.tabs.getCurrent + chrome.tabs.remove` with
`window.close()` fallback.
WXT config: `web_accessible_resources` list `setup-callback.html` with
`matches: ["https://*/*", "http://localhost/*"]`; `optional_host_permissions: []`.

**Acceptance:**
- Manual: build extension; the emitted bundle includes
  `.output/chrome-mv3/setup-callback.html` and loads without CSP errors
- `rg -n 'inline|<script>(?!.*type="module")' apps/extension/src/entrypoints/setup-callback`
  returns no matches

**Commit:** `feat(extension): setup-callback entrypoint with tabs-api auto-close`

- [ ] **Task 38: Wizard XState machine**

**Files:** create `apps/extension/src/lib/sync-setup/{types.ts, state-machine.ts, exchange.ts, api-handshake.ts, backup.ts, config.ts, semver.ts}`.
**What:** States and events per spec §2.5. Side-effect services invoked by
states: backup, permission request, health check (uses an inline semver
comparator in `semver.ts` — ~15 lines that split on `.`, parse ints, compare
left-to-right; protocol versions are simple dotted numbers with no
prerelease, so no library needed), exchange POST, upload via
`initialBootstrap`, download via `fullReset`.

Server-side also needs the same comparator logic for Task 24's
`protocol-version` middleware. Duplicate the tiny function in
`apps/cloud/app/lib/semver.ts` or lift it into `@opentab/protocol` — pick
one location and reference it from both. **No external `compare-versions`
or `semver` dep.**

**Acceptance:**
- Unit tests: linear happy path reaches `complete`; `HEALTH_FAIL(extension_too_old)`
  + RETRY returns to `health_checking`; `AUTHORIZATION_TIMEOUT` + RETRY;
  `EXCHANGE_INVALID` transitions back to `host_input`;
  `direction_choice` button enablement matches local-empty / server-empty
  matrix

**Commit:** `feat(extension): XState setup wizard machine`

- [ ] **Task 39: Wizard UI + callback bridge hook**

**Files:** `apps/extension/src/components/settings/{sync-setup-wizard.tsx, sync-status-card.tsx, sync-disconnect-dialog.tsx}`;
modify `apps/extension/src/entrypoints/settings/App.tsx`.
**What:** React components consuming the machine. `useSetupCallbackBridge`
hook listens on `chrome.runtime.onMessage` **and** drains storage on mount,
with a 10-minute staleness check on storage payloads (spec §2.5). Settings
renders wizard when `syncAuth === disabled`; renders status card when
authenticated.

**Acceptance:**
- Manual: wizard renders full flow through to `direction_choice`
  (mocked / real server); closing the settings tab mid-authorization and
  reopening it still results in the wizard picking up the exchange via
  storage drain

**Commit:** `feat(extension): wizard UI and callback bridge`

- [ ] **Task 40: Wire background to start sync on authenticated**

**Files:** modify `apps/extension/src/entrypoints/background.ts`.
**What:** `ensureSyncEngine` checks `getSyncAuth()`; starts the engine and
sets the alarm only when `kind === "authenticated"`. Handlers for
`SYNC_SETUP_COMPLETE` / `SYNC_DISCONNECTED` call `ensureSyncEngine`.
`SYNC_SETUP_CALLBACK` is **not** handled here (spec §2.5 — wizard scoped).

**Acceptance:**
- Manual: completing the wizard triggers the sync alarm; a subsequent
  `Disconnect` clears the alarm; re-enabling re-arms it
- Background console shows no unhandled message warnings

**Commit:** `feat(extension): background integration with auth-gated sync engine`

- [ ] **Task 41: Milestone checkpoint — single-device upload end to end**

**What:** Manual walkthrough of spec §2.7 scenario A.

**Acceptance:**
- Fresh extension profile, pre-populate a few workspaces / collections / tabs
- Wizard: backup → host → health → authorize → upload → complete
- `chrome.storage.local.opentab_sync_auth_v1.kind === "authenticated"`
- Extension settings shows "Last synced: just now"
- Web `/dash` (implemented next group — skip this line if `/dash` not yet in place and use `/api/sync/snapshot` curl with the stored deviceToken) returns the uploaded entities
- Evidence captured to `docs/superpowers/acceptance/scenario-a.md`

**Commit:** `docs: scenario A acceptance evidence` (can be empty commit)

---

## Group 8 — Web: read-only data + devices

Outcome: authenticated users see a tree of their synced data and a device
management list.

- [ ] **Task 42: Top nav in layout**

**Files:** modify `apps/cloud/app/routes/layout.tsx`.
**What:** Add a top nav bar with Dashboard / Devices / Settings / (Admin
conditional) + user menu reusing `components/user/user-nav.tsx`. Nav
rendered only for authenticated routes (not under `/auth/*`).

**Acceptance:**
- Manual: `/` logged-out has no nav bar; `/dash` (next task) has nav

**Commit:** `feat(cloud): top navigation in authenticated layout`

- [ ] **Task 43: `/devices` list + detail + revoke**

**Files:** `apps/cloud/app/routes/devices/{layout, index, $deviceId}.tsx`.
**What:** Single-table list for `/devices`, no JOIN. `/devices/$deviceId`
batches device + recent 30 change logs. Revoke action sets `revokedAt`.

**Acceptance:**
- Manual: after scenario A, `/devices` shows one row; detail page shows
  recent activity; Revoke returns to list with the row marked revoked and
  the extension's next sync call yields 401 → wizard reopens

**Commit:** `feat(cloud): /devices list, detail, and revoke`

- [ ] **Task 44: `/dash` workspace list**

**Files:** `apps/cloud/app/routes/dash/{layout, index}.tsx`.
**What:** Loader batches workspaces + per-workspace collection and tab
counts. Cards sorted by `order`.

**Acceptance:**
- Manual: `/dash` shows N workspace cards with correct counts after
  scenario A
- Unit / integration: loader returns the expected shape for seeded data

**Commit:** `feat(cloud): /dash workspace list`

- [ ] **Task 45: `/dash/:workspaceSyncId` expanded tree**

**Files:** `apps/cloud/app/routes/dash/$workspaceSyncId.tsx`.
**What:** Loader batches workspace + its collections + user's tabs;
app-side filters tabs to in-workspace collections. Collections are
`<Collapsible>`; tabs render as real `<a target="_blank">` links.

**Acceptance:**
- Manual: drilling into a workspace shows collections with correct tab
  counts; tabs open their URL in a new tab when clicked
- Loader over-fetch is tolerable at spec-stated scale (≤ 2k tabs per user)

**Commit:** `feat(cloud): /dash/:workspaceSyncId read-only tree`

- [ ] **Task 46: Verify landing redirect**

**Files:** none (verification only — the redirect was implemented in Task 10).
**What:** Sanity-check that the `/` → `/dash` redirect now resolves to an
actually rendered page, since `/dash` only exists as of Task 44.

**Acceptance:**
- Visiting `/` while authenticated lands on `/dash` with the workspace list
  rendered (no 404 in between)

**Commit:** none required

- [ ] **Task 47: Milestone checkpoint — scenario B (second device + LWW)**

**What:** Full manual walkthrough of spec §2.7 scenario B.

**Acceptance:**
- Second Chrome profile completes wizard with Download
- Both profiles show identical workspace tree
- Rename same workspace on both devices 5s apart → both converge to the
  later edit
- Disconnect profile 2 network; create collection; reconnect; pending = 0;
  profile 1 pulls it; Web `/dash` shows it
- Evidence captured to `docs/superpowers/acceptance/scenario-b.md`

**Commit:** `docs: scenario B acceptance evidence`

---

## Group 9 — Web: metadata editing

Outcome: users can create, rename, edit, and delete workspaces, collections,
and tabs on the Web. All writes traverse the same sync service that push
uses, so extensions converge on next pull.

- [ ] **Task 48: Workspace CRUD routes**

**Files:** `apps/cloud/app/routes/dash/workspaces.{new,$syncId.edit,$syncId.delete}.tsx`.
**What:** RR7 actions build a `PushOp` (create / update / delete) and call
`pushOps({ userId, deviceId: "web" }, [op])`. Forms use `@conform-to/zod`
with the protocol entity schemas. Validation errors display inline.

**Acceptance:**
- Manual: create a workspace on Web → appears in extension after next pull
- Manual: rename, delete likewise
- `sync_change_logs.device_id = "web"` for these ops
- Form validation rejects empty name, > 100 chars

**Commit:** `feat(cloud): Web workspace metadata CRUD`

- [ ] **Task 49: Collection CRUD routes**

**Files:** `apps/cloud/app/routes/dash/$workspaceSyncId.collections.{new,$collectionSyncId.edit,$collectionSyncId.delete}.tsx`.
**What:** Same pattern as Task 48.

**Acceptance:**
- Manual: create, rename, delete a collection; changes propagate to
  extension
- Validation rejects missing / too-long name

**Commit:** `feat(cloud): Web collection metadata CRUD`

- [ ] **Task 50: Tab CRUD routes**

**Files:** `apps/cloud/app/routes/dash/collections.$collectionSyncId.tabs.{new,$tabSyncId.edit,$tabSyncId.delete}.tsx`.
**What:** Same pattern as Task 48. Tab form: URL (required, valid URL, ≤ 500),
title (optional, ≤ 500), favIconUrl (optional valid URL).

**Acceptance:**
- Manual: add a tab with manual URL; edit URL / title; delete — propagates
  to extension
- Validation rejects invalid URL, too-long fields

**Commit:** `feat(cloud): Web tab metadata CRUD`

- [ ] **Task 51: Milestone checkpoint — scenarios C and D**

**What:** Manual walkthrough of spec §2.7 scenario C (revocation + protocol
gate) and scenario D (admin visibility), plus Phase 2 cross-direction
acceptance (Web edit → extension pull; extension edit → Web refresh).

**Acceptance:**
- Scenario C: revoke from Web → extension's next sync → 401 → wizard reopens
- Scenario C: forcibly set extension `PROTOCOL_VERSION` to mismatching major
  → sync request returns 426 → UI surfaces mismatch banner
- Scenario D: admin sees users grid, not user data trees; non-admin denied
- Phase 2 cross-direction: Web rename → extension sees it after next pull;
  extension rename → Web `/dash` F5 shows it
- Evidence captured to `docs/superpowers/acceptance/scenario-cd-phase2.md`

**Commit:** `docs: scenarios C / D and Phase 2 cross-direction acceptance`

---

## Group 10 — Ship

- [ ] **Task 52: Final automated gate**

**What:** Run the full acceptance suite.

**Acceptance:**
- `pnpm install` clean
- `pnpm lint && pnpm --filter ... check-types && pnpm build && pnpm test`
  green across every package
- `grep -c "FOREIGN KEY" apps/cloud/drizzle/migrations/*.sql` → `0`
- Handshake smoke script passes
- All unit tests enumerated in earlier tasks pass (aggregate count recorded
  in the acceptance notes)

**Commit:** no new commit (just verification)

- [ ] **Task 53: Cloudflare staging deploy**

**Files:** none (or a deploy workflow under `.github/workflows/` if you want
CI-driven deploys — optional, not required for this plan).

**Step-by-step (strict order — deploy will fail if secrets are missing at
auth handler init, so secrets precede deploy):**

1. Provision the staging D1 and KV if they don't already exist:
   - `pnpm dlx wrangler d1 create opentab-cloud-staging`
   - `pnpm dlx wrangler kv namespace create APP_KV_STAGING`
   - Record both IDs in a staging-specific `wrangler.jsonc` environment
     block (or use `--env staging`).
2. Apply remote D1 migration:
   - `pnpm --filter @opentab/cloud exec wrangler d1 migrations apply DB --env staging --remote`
3. **Set all secrets before deploy.** Run each of the following; the
   command interactively prompts for the value:
   ```
   pnpm --filter @opentab/cloud exec wrangler secret put BETTER_AUTH_SECRET --env staging
   pnpm --filter @opentab/cloud exec wrangler secret put GITHUB_CLIENT_ID --env staging
   pnpm --filter @opentab/cloud exec wrangler secret put GITHUB_CLIENT_SECRET --env staging
   pnpm --filter @opentab/cloud exec wrangler secret put BETTER_AUTH_ADMIN_USER_ID --env staging
   pnpm --filter @opentab/cloud exec wrangler secret put CHROMIUM_EXTENSION_IDS --env staging
   ```
4. Verify secrets are set:
   - `pnpm --filter @opentab/cloud exec wrangler secret list --env staging`
     → expect all five keys present.
5. Deploy:
   - `pnpm --filter @opentab/cloud exec wrangler deploy --env staging`
   (Note: we do **not** use `pnpm cloud:deploy` for this — the root script
   targets the default `wrangler deploy` which omits `--env`.)

**Acceptance:**
- Secret-list step returns all five expected keys before deploy runs
- `curl https://<staging-host>/api/health | jq .protocolVersion` returns
  the expected string
- Scenario A reproduces against the staging URL with a production-built
  extension (host in wizard set to the staging URL)
- Staging URL recorded in `docs/superpowers/acceptance/deploy.md`

**Commit:** `docs: staging deploy URL and acceptance` (may be empty)

- [ ] **Task 54: Final cleanup and spec sync**

**What:** Remove any temp files in `docs/superpowers/acceptance/` you don't
want in git. Audit the spec for drift: every `rg -n "..."` above still
passes; every claim in the spec about wire format matches what shipped.
Update `docs/superpowers/specs/2026-04-24-apps-cloud-design.md` only if
drift is found.

**Acceptance:**
- `git status` clean
- Design spec self-consistent with the running code

**Commit:** `docs(spec): resync apps/cloud design with shipped implementation` (only if changes)

---

## Rollback notes

Each task commits on a green state. If a mid-plan rollback is needed:

```
git log --oneline feat/cloud-server
git reset --hard <commit-before-first-cloud-task>
```

Only run on explicit instruction — the extension's localProfileId adoption
and the removal of `apps/server`/`apps/web` are both reversible via this
reset.
