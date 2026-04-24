# apps/cloud — Full-Stack Rebuild Design

**Date:** 2026-04-24
**Status:** Approved
**Scope:** Replace `apps/server` + `apps/web` + `packages/{api,auth,db}` with a
single React Router v7 + Cloudflare Workers + D1 + Better Auth application
(`apps/cloud`), delivered in three phases.

> This document is the **design spec** — what and why. Implementation
> details (code, file-by-file tasks, test code, commit sequencing) live in
> sibling plans under `docs/superpowers/plans/`, one per phase. A plan is
> never merged with the spec.

---

## 0. Introduction

### 0.1 Goal

Build one Cloudflare-hosted full-stack application serving two audiences:

1. **The Chrome extension** — provides a sync API so a user's workspaces /
   collections / tabs stay consistent across multiple devices.
2. **The Web** — login, account settings, device management, and a
   read-only view (Phase 1) or editable view (Phase 2) of the same data,
   so users without the extension (or on a device without it) can still
   manage their library.

The extension remains local-first. Server sync is strictly opt-in behind an
explicit "Enable Sync" wizard that forces the user to pick an initial
direction (upload my local data, or download server data) before any data
crosses the wire.

### 0.2 Non-goals

- Real-time collaboration
- Offline Web editing
- Drag-drop / dedup / advanced sort on the Web
- Near-realtime sync (Phase 1 is pure polling; Phase 3 considers nudges)
- Multi-tenant / multi-account data sharing
- R2 backup history
- Account deletion (Phase 3)
- Admin features beyond what the scaffold already ships

### 0.3 Starting point

- Monorepo `baku/` with `apps/extension` already implementing local Dexie,
  outbox, change-log, LWW sync engine per
  `docs/superpowers/specs/2026-04-12-server-sync-design.md`.
- Scaffold at `~/code/github/app-rails/react-router-v7-better-auth` — a
  ready-made RR7 + Better Auth + Drizzle + D1 template.

### 0.4 Decision snapshot

| # | Area | Decision |
|---|---|---|
| 1 | Phasing | Phase 0 (setup) → Phase 1 (sync + read-only Web) → Phase 2 (Web edit) → Phase 3 (future). **MVP = Phase 1 + Phase 2 combined**; Phase 1 alone is not a shippable product milestone |
| 2 | Web scope (Phase 1) | Read-only + device management + login + account settings + admin (kept for future features) |
| 3 | Web scope (Phase 2) | CRUD on workspace / collection / tab metadata (no drag-drop, no dedup, no reorder, no search) |
| 4 | Cold-start sync flow | Explicit wizard: backup → host → health → login → Web authorize handoff → exchange for device token → upload OR download → ongoing sync |
| 5 | Web user auth | Better Auth: email/password + forget-password + GitHub OAuth + admin plugin |
| 6 | Extension sync auth | Custom opaque `deviceToken`, one per device, issued by a one-time cookie-authenticated exchange. Long-lived, revocable, server stores only `sha256(deviceToken)`. No access-token / refresh-token lifecycle. Better Auth Device Authorization plugin is **not used** |
| 7 | Dropped from scaffold | Google OAuth, R2 avatar storage, todos demo, account deletion (to Phase 3) |
| 8 | Sync protocol | Outbox + change-log + cursor + LWW (ported from the 2026-04-12 server-sync spec) |
| 9 | API style | RR7 resource routes returning JSON |
| 10 | Monorepo layout | `apps/cloud` + new `packages/protocol` (zod schemas shared by extension and server) |
| 11 | Cloudflare services | D1 (all correctness-critical state) + KV (only Better Auth session cache / rate-limit). No R2, no Durable Objects, no Queues in Phase 1 |
| 12 | Real-time | Pure polling in Phase 1; nudge and near-real-time deferred to Phase 3 |
| 13 | Foreign keys | All FK constraints removed, including scaffold and Better Auth defaults. D1's SQLite FK support is weak and FK declarations block the schema-evolution patterns we need (snapshot reset, soft delete, out-of-order sync application) |
| 14 | JOIN policy | Avoid JOIN; prefer `db.batch()` + app-layer merge for multi-table reads |
| 15 | UUID version | UUID v7 globally (generation and validation). Strict regex — no v4 fallback |
| 16 | URL length | `tab.url`, `tab.favIconUrl`, `tab.title` capped at 500 chars. `name` capped at 100 |
| 17 | Protocol version | Semver `PROTOCOL_VERSION` from `packages/protocol/package.json.version`. `/api/health` exposes a compatibility window (`minSupportedProtocolVersion`, `minSupportedExtensionVersion`, `recommendedExtensionVersion`). Extension distinguishes hard-block from soft-warning |
| 18 | Validation | Double-sided zod parse: server parses request bodies; extension parses response bodies |
| 19 | LWW semantics | Strict: `update` op targeting a non-existent entity is `lww-skip`-ed, not auto-created. Push response carries `lwwSkipped[]` as a first-class terminal bucket so clients mark those ops synced instead of retrying |
| 20 | Disconnect | Extension Disconnect clears local token only; the server-side `devices` row stays (set to `revokedAt = null` unless the user also revokes via Web) |
| 21 | Wizard state machine | XState |
| 22 | Token binding | Sync endpoints derive `deviceId` and `userId` from the `deviceToken` server-side. Request bodies never self-report device identity |
| 23 | Local identity | Extension has a stable `localProfileId` generated once per install/profile. Local data ownership (`accountId = localProfileId`) is independent of login state. On Phase 0 bootstrap, the value is **adopted** from the existing local UUID or oldest workspace's `accountId` so pre-existing entities remain visible after the `resolve-account-id.ts` rewrite — no Dexie data migration required |
| 24 | Landing behavior | Authenticated → redirect to `/dash`; unauthenticated → marketing + sign-in CTAs |
| 25 | Web route prefix | `/dash/*`, `/devices/*`, `/settings/*`, `/auth/*`, `/admin/*`, `/connect/extension` (exchange handoff) |
| 26 | Tab rendering | Real `<a href target="_blank">` links in the Web read-only tree |
| 27 | Top nav placement | In `app/routes/layout.tsx` so unauthenticated `/auth/*` pages stay visually minimal |
| 28 | Browser scope (Phase 1) | Chromium-only (Chrome / Edge / Brave / Opera; unified `chrome-extension://<id>` origin). Firefox (`moz-extension://<uuid>`) and Safari deferred to Phase 3 — require separate builds and a browser-bucketed allowlist |
| 29 | Production `trustedOrigins` | Enumerate real Chromium store IDs. The `chrome-extension://*` wildcard is dev-only |
| 30 | Callback bridge | `chrome.storage.local` (durable) + `chrome.runtime.sendMessage` (fast path). Wizard React component listens to both. Background is not involved until setup completes |
| 31 | Callback page | A dedicated WXT HTML entrypoint under `src/entrypoints/setup-callback/` — MV3 CSP forbids inline scripts, so no "inline" variant is permitted |
| 32 | Callback tab close | Prefer `chrome.tabs.getCurrent()` + `chrome.tabs.remove()`. `window.close()` is only a last-ditch fallback |
| 33 | Deployment toolchain | Alchemy IaC; `apps/cloud/alchemy.run.ts` is the single source of truth for CF resources. See `2026-04-24-apps-cloud-deployment-alchemy-design.md` |

---

## 1. Phase 0 — Repo Cleanup + Scaffold Migration

**Goal:** Delete legacy `apps/server` + `apps/web` + `packages/{api,auth,db}`;
import the scaffold into `apps/cloud`; trim the scaffold's features we don't
need; wire it into the monorepo's pnpm / turbo / biome / tsconfig conventions.
Phase 0 contains **no OpenTab business logic** — no sync tables, no sync
endpoints, no wizard.

### 1.1 Scope

Three work streams:

1. **Legacy cleanup** — remove the old server/web apps and their supporting
   packages; shrink `packages/shared` to the pure domain types still used
   by the extension.
2. **Extension decouple via stubs** — the extension's sync engine,
   background worker, and account-resolution code still import from the
   about-to-be-deleted `trpc.ts` / `auth-manager.ts` / `auth-storage.ts`.
   Deleting those files outright would break the extension build. Phase 0
   replaces them with offline-only stubs and introduces a `localProfileId`
   that adopts any pre-existing local UUID so the extension's local Dexie
   data remains visible after the identity rewrite. The stubs and the real
   implementations replace them in Phase 1.
3. **Scaffold migration** — copy the RR7 scaffold into `apps/cloud/`, drop
   the parts we don't want (Google OAuth, R2 avatars, todos demo), keep
   admin (for future expansion), rewire into the monorepo's shared tooling.

### 1.2 Non-goals for Phase 0

- Extension setup wizard, `/connect/extension`, `/api/extension/exchange/*`
  (Phase 1)
- `/api/health` (Phase 1)
- Any sync protocol table or endpoint (Phase 1)
- Reactivating the extension sync engine — it stays dormant the whole phase
- Any cleanup of the sync-engine / outbox / Dexie v4 migration code —
  those stay exactly as-is, just temporarily disconnected

### 1.3 Acceptance — automated

The build and static-analysis toolchain all pass without modification to
existing scripts:

- `pnpm install` clean
- `pnpm --filter @opentab/cloud {check-types,lint,build}` green
- `pnpm --filter @opentab/extension {check-types,lint,build,test}` green
- Monorepo-wide `pnpm lint` green — no dangling imports from the deleted
  packages
- `apps/cloud` can boot locally with `pnpm --filter @opentab/cloud dev`
- Local D1 migration + admin seed both succeed

A smoke HTTP probe of the booted local server returns:

- Landing page HTML contains the string "OpenTab"
- `/auth/sign-in` → 200
- `/admin` unauthenticated → 302 or 401
- `/todos` → 404
- `/api/auth/ok` → 200 "ok"

### 1.4 Acceptance — manual

**Web**:

- Landing renders the OpenTab page, not the scaffold demo
- Email registration flow writes a verification URL to the dev console; the
  URL works; the user can then sign in
- GitHub OAuth round-trip succeeds end-to-end (requires `.dev.vars` to
  have Dev GitHub OAuth app credentials)
- Settings sub-pages all function: account, appearance (theme), password,
  sessions (revoke works), connections (GitHub shown, Google **not** shown)
- Forget-password flow generates a reset URL in the console that resets the
  password correctly
- Admin dashboard and users grid render for an admin user; non-admin users
  are redirected or denied

**Extension**:

- Built extension installs in Chrome; the tabs page shows the user's
  existing workspaces (local Dexie data remains visible, validating the
  `localProfileId` adoption)
- Settings → Sync toggle is disabled with a "Coming back in Phase 1" tooltip
- Local CRUD (create workspace, add tab, delete collection) all succeed
- Background service-worker console has zero red errors and zero failed
  network requests (no one starts the sync engine)

---

## 2. Phase 1 — Sync Core

**Goal:** Extension users can complete the setup wizard, obtain a long-lived
device token, and run the existing local-first sync engine against the new
server. The Web gains authenticated device management and a read-only
visualization of the user's synced data.

### 2.1 Scope

1. **Protocol package** (`packages/protocol`) — zod schemas for the wire
   format, shared by extension and server.
2. **Server-side D1 schema** — entity tables (workspaces, collections,
   tabs), bookkeeping (`sync_applied_logs`, `sync_change_logs`), devices,
   and the one-time extension-setup exchange table.
3. **Server-side endpoints** — `/api/health`, `/api/sync/{push,pull,snapshot}`,
   `/api/extension/exchange/consume`, `/connect/extension` (cookie-authed
   handoff UI), plus internal services and repositories.
4. **Extension** — setup wizard (XState), callback bridge, sync HTTP client,
   Dexie v5 UUID-v7 migration, rewiring `sync-engine` onto the new transport,
   local profile identity.
5. **Web** — landing redirect, `/dash`, `/dash/:workspaceSyncId` (read-only
   tree), `/devices`, `/devices/:deviceId`.

### 2.2 Data model (shape and purpose only)

Tables introduced in Phase 1:

- **`workspaces`, `tab_collections`, `collection_tabs`** — the user's synced
  entities. Each row carries its server-local integer `id`, the
  extension-generated `syncId` (UUID v7), an `order` string for fractional
  indexing, soft-delete `deletedAt`, `lastOpId` for LWW tie-break, parent
  reference via the parent's `syncId` (no DB-level FK — sync may arrive
  out of order). All queries are scoped by `(user_id, sync_id)` or
  `(user_id, parent_sync_id)`.
- **`sync_applied_logs`** — idempotency gate. `(user_id, op_id)` UNIQUE.
  Catching the UNIQUE-violation is the duplicate-detection primitive; no
  SELECT-then-INSERT race.
- **`sync_change_logs`** — pull cursor source. Monotonic `seq`, scoped by
  `user_id`. Writes carry the originating `device_id` so Phase 2 UI can
  surface "who changed this".
- **`devices`** — one row per active extension install. `id = deviceId` (UUID
  v7), `token_hash = sha256(deviceToken)` UNIQUE, `revoked_at` nullable for
  audit-preserving revoke. No `sessionId`; sync endpoints resolve identity
  by `tokenHash`.
- **`extension_setup_exchanges`** — short-lived one-time-use record bridging
  a logged-in Web session to an extension-owned opaque `deviceToken`.
  `codeHash` UNIQUE; `expiresAt` ≤ 10 min; `consumedAt` set atomically.

The scaffold's existing `users` / `accounts` / `verifications` / `sessions`
tables stay but **all their FK declarations are removed** (Phase 0 already
regenerated the baseline migration without them).

### 2.3 Wire protocol (packages/protocol)

Package exports, in terms of responsibility, not implementation:

- **`PROTOCOL_VERSION`** — semver string sourced from the package's own
  `version` field.
- **Constants** — `UUID_V7_REGEX`, `MAX_BATCH_SIZE`, payload length caps.
- **Entity payload schemas** — per-entity, per-action (create / update /
  delete), URL capped at 500, `name` capped at 100.
- **`PushOp`** — discriminated union over `kind` with nine variants
  (workspace/collection/tab × create/update/delete). Cross-field invariant
  `payload.syncId === entitySyncId` is enforced server-side after parse, not
  inside zod.
- **Endpoint request/response schemas** — health, push, pull, snapshot,
  exchange-consume. Push **does not** carry `deviceId` in the body; the
  server derives it from the Bearer token.
- **Push response** — three terminal buckets (`applied[]`, `duplicates[]`,
  `lwwSkipped[]`) and at most one retryable `error`. Clients mark all three
  terminal lists as `synced` in the outbox.
- **Error codes** — `API_VERSION_MISMATCH` (426), `UNAUTHORIZED` (401),
  `DEVICE_NOT_REGISTERED` (401), `EXCHANGE_INVALID` (409),
  `INVALID_PAYLOAD` / `SYNC_ID_MISMATCH` / `PARENT_NOT_FOUND` /
  `CROSS_USER_REFERENCE` (400), `RATE_LIMITED` (429), `INTERNAL` (500).

### 2.4 Server responsibilities

- **`/api/health`** — returns `protocolVersion`, `serverVersion`,
  `minSupportedProtocolVersion`, `minSupportedExtensionVersion`,
  `recommendedExtensionVersion`, `serverTime`, `timezone`. Public, IP-rate-limited.
- **`/connect/extension`** — cookie-authenticated. Renders "approve this
  device" UI; on approve, creates an exchange record and redirects the
  browser to `callbackUrl?exchange_code=...&nonce=...`. Rejects
  `callback_url` values not on the extension-origin allowlist.
- **`/api/extension/exchange/consume`** — exchanges a single-use code for a
  long-lived `deviceToken`. Atomic in one D1 batch: mark consumed, rotate
  or create the `devices` row, return `{ deviceId, deviceToken, user }`.
  Replay returns 409.
- **`/api/sync/{push,pull,snapshot}`** — Bearer `deviceToken`. The
  `device-token` middleware is the sole source of `userId` and `deviceId`
  for the handler chain; the request body never carries identity fields.
  Protocol-version and extension-version headers are enforced by a
  dedicated middleware that mirrors `/api/health`'s compatibility window
  constants.
- **Write path for push** — per op, a single D1 batch of three statements:
  insert into `sync_applied_logs` (idempotency), conditional upsert the
  entity with an LWW-aware `setWhere`, insert into `sync_change_logs`.
  UNIQUE violation → `duplicate`; setWhere false or update-of-nonexistent
  → `lww-skip`; all three OK → `applied`; other failure → `error` (stops
  loop, remaining ops unprocessed).
- **Rate limiting** — thin KV-backed token bucket per `(userId, endpoint)`
  (or `(ip, endpoint)` for public endpoints). No external dependency.

### 2.5 Extension responsibilities

- **Wizard (XState)** — linear machine with branches for health failure,
  authorization failure, and exchange failure. Each state owns one
  side-effect (backup, permission request, health GET, open handoff tab,
  consume exchange, upload, download). See Decision 4 for the flow.
- **Callback bridge** — setup-callback WXT entrypoint writes to
  `chrome.storage.local` (durable) then sends a runtime message (fast path).
  Wizard React hook listens on runtime messages and drains storage on
  mount. Background is uninvolved until `SYNC_SETUP_COMPLETE` fires.
- **Sync HTTP client** — every request carries protocol + extension version
  headers; every response is zod-parsed; 401 clears local auth and
  broadcasts `SYNC_AUTH_REQUIRED` (no refresh retry — token is
  long-lived); 426 broadcasts `SYNC_PROTOCOL_MISMATCH`.
- **Auth storage** — a single `chrome.storage.local` key holding either
  `{ kind: "disabled" }`, `{ kind: "configured", host }`, or
  `{ kind: "authenticated", host, deviceId, deviceToken, deviceName }`.
- **Dexie v5 migration** — regenerates every `syncId` and `opId` as UUID
  v7, updates child references (`workspaceSyncId`, `collectionSyncId`),
  clears any pre-existing pull cursor.
- **Device identity** — `deviceId` is created once per install, persisted
  in `chrome.storage.local`, and reused across disconnect and Web-side
  revoke. The server upserts by `id`, so re-authorization rotates the
  token on the same audit row.
- **Sync engine reuse** — all LWW logic, outbox management, `fullReset`,
  retry, and cleanup logic from the 2026-04-12 spec stay intact. Phase 1
  only replaces the transport and auth layers.

### 2.6 Web responsibilities (Phase 1 = read-only + devices)

- **Landing `/`** — authenticated redirect to `/dash`; unauthenticated
  shows marketing.
- **`/dash`** — loader aggregates per-user `workspaces` + collection count
  per workspace + tab count per collection via a three-query D1 batch,
  presented as cards with summary statistics.
- **`/dash/:workspaceSyncId`** — loader fetches the workspace + its
  collections + the user's tabs in one batch; the tabs query over-fetches
  and filters app-side, trading a bit of bandwidth for simpler query shape.
  Rendered as collection `<Collapsible>`s; tabs render as real `<a>` links
  opening in new tabs.
- **`/devices`** — single-table list of the user's devices (active by
  default, optional "show revoked" toggle).
- **`/devices/:deviceId`** — device metadata + last 30 change-log entries
  (metadata only, no payload expansion) + Revoke button.
- **Top nav** — mounted in `app/routes/layout.tsx` so unauthenticated
  `/auth/*` pages stay minimal.

No Web editing in Phase 1 — all CRUD routes and forms belong to Phase 2.

### 2.7 Acceptance — manual scenarios

**Scenario A — First device bootstrap**: register a new user on Web;
install the Phase 1 extension; populate a few workspaces / collections /
tabs; open the wizard; complete backup → host → health → authorize →
exchange → upload → ongoing sync. The Web `/dash` then shows the uploaded
data tree with accurate counts; `/devices` lists the device.

**Scenario B — Second device download + LWW convergence**: install on a
second profile, sign in as the same user, complete the wizard, choose
Download. Both devices show identical data. Rename the same workspace on
each device 5 seconds apart; both converge to the later edit. Disconnect
one device's network, create a collection; reconnect, confirm it
propagates.

**Scenario C — Revocation + protocol gate**: on Web, revoke device B; the
next sync call from device B receives 401, clears its local auth, and
returns to the wizard entry. Temporarily force device B's local
`PROTOCOL_VERSION` to a mismatching value; confirm the sync-protocol
mismatch indicator appears and the sync pauses.

**Scenario D — Admin visibility**: admin user sees the users grid
(`/admin/users`). Admin does **not** see other users' workspace / tab
data. Non-admin visits to `/admin/*` are redirected or denied.

### 2.8 Acceptance — automated gate

- Unit tests covering: protocol zod schemas; LWW rules including
  duplicate, tie-break, update-of-nonexistent; rate-limit middleware;
  device-token middleware rejecting revoked tokens; Dexie v5 migration;
  wizard machine for the four failure branches; sync-client header and
  error branches; exchange consume replay returning 409.
- `grep -c "FOREIGN KEY" apps/cloud/drizzle/migrations/0001_*.sql` returns
  0.
- Compatibility window is a single server-side source of truth that
  powers both `/api/health` response and the sync middleware. Any drift
  between them is a spec-level bug.
- An end-to-end handshake scripted with `curl` succeeds: sign-in cookie
  jar → `/connect/extension` approve → redirect contains `exchange_code`
  → consume returns `deviceToken` → `/api/sync/push` accepts one op →
  `/api/sync/pull` returns it → replay consume yields 409.

### 2.9 Phase 1 done definition

- Automated gate green on CI
- Scenarios A–D walked through manually, evidence recorded under
  `docs/superpowers/phase1-acceptance/`
- Legacy `apps/server` / `apps/web` / `packages/{api,auth,db}` absent from
  git
- `apps/cloud` deployed to a CF staging environment; scenario A
  reproduces against the deployed URL
- Spec updated to match the delivered implementation (no drift)

---

## 3. Phase 2 — Web Editing (outline)

**Scope**: Web actions for create / rename / change-icon / delete on
workspaces; create / rename / delete on collections; create / edit / delete
on tabs. No reorder, no drag-drop, no dedup, no bulk tools, no search.

**Reuse**: Web actions call `pushOps()` from Phase 1's sync service with a
sentinel `deviceId = "web"`. The sync ledger does not distinguish extension
writes from Web writes — `sync_change_logs.device_id = "web"` is interpreted
by the device list UI as "Web browser". No new protocol ops needed; no
`PROTOCOL_VERSION` bump.

**Acceptance outline**: Web create / rename / delete propagate to the
extension after its next pull, and the reverse direction works. Web-side
validation errors surface as form errors, not as broken sync.

---

## 4. Phase 3 — Backlog

Ordered by product priority; each item spawns its own spec when picked up.

| Item | Likely trigger |
|---|---|
| Account deletion (multi-table batch cleanup) | User self-service requirement |
| Near-real-time nudge (KV `lastChangeAt:<userId>`) | Sync-lag user feedback |
| Durable Objects for push-based sync | Real collaboration use case |
| R2 backup history + Web restore | Data-loss / rollback support |
| Subscription billing, paid quota | Commercial launch |
| Admin expansion (data moderation, anomaly inspection) | Support load |
| Orphan-row cron (devices, exchanges, applied_logs) | D1 size growth |
| Multi-host / multi-account extension | Enterprise ask |
| Firefox / Safari builds + origin allowlist buckets | Cross-browser reach |

---

## Appendix A — High-level file movements

### A.1 Deleted in Phase 0

- `apps/server/`, `apps/web/`
- `packages/api/`, `packages/auth/`, `packages/db/`
- `packages/shared/src/types.ts` — `AuthState.online` variant, any re-export
  from `@opentab/api` or `@opentab/db`
- `apps/extension/src/lib/api.ts` (if present)

### A.2 Stubbed in Phase 0, fully rewritten in Phase 1

- `apps/extension/src/lib/trpc.ts`
- `apps/extension/src/lib/auth-manager.ts`
- `apps/extension/src/lib/auth-storage.ts`

### A.3 Migrated from scaffold to `apps/cloud/` in Phase 0

- `workers/`, `app/` (minus admin-adjacent deltas noted in plan),
  `drizzle/schema/auth.ts`, scaffold config files except those the monorepo
  root owns (biome, lefthook, commitlint)
- Scaffold features dropped: Google OAuth config, R2 service and
  dependencies, todos demo and its schema, cropper-related UI components,
  avatar upload entrypoints

### A.4 New in Phase 1

- `packages/protocol/` — shared wire schemas (empty stub created in Phase 0
  so workspace wiring is already settled)
- `apps/cloud/app/routes/{api/health,api/sync/*,api/extension/exchange/consume,
  connect/extension,dash/*,devices/*}`
- `apps/cloud/app/services/{sync*,devices*,extension-setup*}.server.ts`
- `apps/cloud/app/middlewares/{device-token,protocol-version,rate-limit}.ts`
- `apps/cloud/drizzle/schema/{extension-setup-exchanges,sync-devices,sync-workspaces,
  sync-tab-collections,sync-collection-tabs,sync-applied-logs,sync-change-logs}.ts`
- Extension: `src/lib/sync-client.ts`, `sync-auth-storage.ts`,
  `sync-setup/*`, `dexie-migrations/v5-uuid-v7.ts`, setup-callback
  entrypoint, sync UI components

Plan documents carry the file-by-file detail.

---

## Appendix B — Environment configuration checklist

### B.1 Cloudflare resources (one-time)

- `wrangler d1 create opentab-cloud` — record `database_id` into `wrangler.jsonc`
- `wrangler kv namespace create APP_KV` — record `id` into `wrangler.jsonc`

### B.2 GitHub OAuth apps

Register a Dev and a Prod OAuth app:
- Dev callback: `http://localhost:5173/api/auth/callback/github`
- Prod callback: `https://<your-domain>/api/auth/callback/github`

### B.3 Production trusted-origins

Phase 1 scope: Chromium-only. Better Auth `trustedOrigins` and the
`/connect/extension` callback allowlist both consume an environment-driven
list of Chromium extension origins. Production must set
`CHROMIUM_EXTENSION_IDS` (comma-separated). Dev may use the
`chrome-extension://*` wildcard. Phase 3 extends the allowlist to include
`moz-extension://` and Safari origins.

### B.4 Secrets

`BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`BETTER_AUTH_ADMIN_USER_ID` — set via `wrangler secret put` for production
and via `.dev.vars` locally.

### B.5 Extension default sync host

The default sync host is built into the extension at build time: localhost
in dev, the production domain in prod. The production domain is decided at
Phase 1 deployment time and encoded in `src/lib/sync-setup/config.ts`.
