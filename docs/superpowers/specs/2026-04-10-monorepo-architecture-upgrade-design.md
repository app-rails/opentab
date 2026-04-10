# OpenTab Monorepo Architecture Upgrade

## Overview

Comprehensive upgrade of the OpenTab monorepo, inspired by the shiprails-ext (Better-T-Stack) architecture. The upgrade proceeds in two stages: architecture cleanup (Phases 1-7) followed by feature expansion (Phases 8-10).

**Goals:**
- Modular package structure with clear boundaries
- End-to-end type safety via tRPC
- Robust authentication (email/password + OAuth)
- Reusable UI component library
- Lightweight web management panel

**Constraints:**
- Package manager: pnpm (no migration)
- UI primitives: Radix UI (no migration to Base UI)
- Extension offline-first architecture: unchanged
- Zustand, Dexie, @dnd-kit, i18n: unchanged

---

## Phase 1: Git Hooks + Biome Enhancement

**Goal:** Automated code quality gate on every commit.

**Changes:**

1. Install `lefthook` as devDependency at root
2. Create `lefthook.yml`:
   ```yaml
   pre-commit:
     commands:
       format:
         glob: "*.{ts,tsx,js,json,css}"
         run: pnpm biome check --write {staged_files}
   ```
3. Update `biome.json` to enable Tailwind class sorting:
   ```json
   {
     "linter": {
       "rules": {
         "nursery": {
           "useSortedClasses": "warn"
         }
       }
     }
   }
   ```
   Note: `useSortedClasses` is a JS/JSX linter rule (sorts `className` attribute strings), not a CSS rule. It belongs under `linter.rules.nursery`, not `css.linter.rules.nursery`.

**Notes:**
- This repo may be a git worktree (`.git` is a file pointing to main repo). Verify lefthook handles this correctly during installation.
- Pre-commit only processes staged files (`{staged_files}`) to avoid formatting unstaged changes.
- Biome version `^2.4.9` already supports `useSortedClasses`.

**Files created:** `lefthook.yml`
**Files modified:** `biome.json`, `package.json`

---

## Phase 2: `@opentab/config` — Shared TypeScript Configuration

**Goal:** Stable, path-independent tsconfig inheritance for all packages.

**Why a dedicated package:**
- Current approach uses relative paths (`../tsconfig.base.json`, `../../tsconfig.base.json`) which break when packages are nested at different depths.
- With 5 new packages being added (db, auth, api, ui, web), a stable reference via `@opentab/config/tsconfig.base.json` eliminates path counting and allows packages to move freely.
- Zero runtime cost: 4-line package.json, no code, no dependencies, no build step.
- Extensible: can later add `tsconfig.react.json`, `tsconfig.node.json`, shared vitest config, etc.

**Changes:**

1. Create `packages/config/package.json`:
   ```json
   {
     "name": "@opentab/config",
     "version": "0.0.0",
     "private": true
   }
   ```

2. Move `tsconfig.base.json` from root to `packages/config/tsconfig.base.json` (content unchanged).

3. Update all existing packages to use the new path:
   - `app-extension/tsconfig.json`: `"extends": "@opentab/config/tsconfig.base.json"`
   - `app-server/tsconfig.json`: `"extends": "@opentab/config/tsconfig.base.json"`
   - `packages/shared/tsconfig.json`: `"extends": "@opentab/config/tsconfig.base.json"`

4. Remove root `tsconfig.base.json` (replaced by package).

**Files created:** `packages/config/package.json`, `packages/config/tsconfig.base.json`
**Files modified:** `app-extension/tsconfig.json`, `app-server/tsconfig.json`, `packages/shared/tsconfig.json`, root `pnpm-workspace.yaml`
**Files deleted:** root `tsconfig.base.json`

---

## Phase 3: Environment Variable Validation (In-Place)

**Goal:** Fail-fast on missing/invalid env vars at server startup.

**Why not a separate package:** Only `app-server` consumes env vars currently. Extract to `@opentab/env` when a second consumer (web app) appears.

**Changes:**

1. Add dependencies to `app-server`: `@t3-oss/env-core`, `zod`

2. Rewrite `app-server/src/env.ts`:
   ```typescript
   import { createEnv } from "@t3-oss/env-core";
   import { z } from "zod";

   export const env = createEnv({
     server: {
       BETTER_AUTH_SECRET: z.string().min(32),
       BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
       TRUSTED_ORIGINS: z.string().optional().transform((v) => v?.split(",").filter(Boolean) ?? []),
       TRUSTED_EXTENSION_ORIGINS: z.string().optional().transform((v) => v?.split(",").filter(Boolean) ?? []),
       NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
       // Added in Phase 5:
       // GOOGLE_CLIENT_ID: z.string().optional(),
       // GOOGLE_CLIENT_SECRET: z.string().optional(),
       // GITHUB_CLIENT_ID: z.string().optional(),
       // GITHUB_CLIENT_SECRET: z.string().optional(),
       // COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).optional(),
       // COOKIE_SECURE: z.coerce.boolean().optional(),
     },
     runtimeEnv: process.env,
   });
   ```

3. Update all `process.env.*` references in `app-server` to use `env.*`.

**Files modified:** `app-server/src/env.ts`, `app-server/src/app.ts` (CORS origin check — now uses `string[]` from transform, so `env.TRUSTED_ORIGINS.includes(origin)` continues to work), `app-server/package.json`, any file referencing `process.env` directly

---

## Phase 4: `@opentab/db` — Drizzle ORM

**Goal:** Type-safe database layer with migration management, defaulting to SQLite with optional PostgreSQL support.

**Database strategy:** SQLite via `better-sqlite3` as default. PostgreSQL via `pg` as optional. Controlled by `DB_DRIVER=sqlite|pg` environment variable.

**Changes:**

1. Create `packages/db/` with structure:
   ```
   packages/db/
     package.json
     tsconfig.json          — extends @opentab/config/tsconfig.base.json
     drizzle.config.ts      — references app-server/.env for DATABASE_URL
     src/
       index.ts             — createDb() factory, db singleton export
       schema/
         index.ts           — unified export of all schemas
         auth.ts            — user, session, account, verification tables
         sync.ts            — workspace, collection, tab tables (placeholder)
   ```

2. Schema `auth.ts` — aligned with better-auth's expected tables:
   - `user`: id, name, email, emailVerified, image, createdAt, updatedAt
   - `session`: id, token, expiresAt, userId (FK → user, cascade delete), ipAddress, userAgent
   - `account`: id, accountId, providerId, userId (FK → user, cascade delete), accessToken, refreshToken, etc.
   - `verification`: id, identifier, value, expiresAt
   - Relations: user → sessions (one-to-many), user → accounts (one-to-many)

3. Schema `sync.ts` — placeholder for future server-side sync:
   ```typescript
   // Placeholder: workspace, collection, tab sync tables
   // Will be implemented when server-side data sync is added
   ```

4. `createDb(config)` factory function:
   - Reads `DB_DRIVER` env var (default: `"sqlite"`)
   - SQLite: uses `better-sqlite3`, DATABASE_URL is file path (default `./data/auth.db`)
   - PostgreSQL: uses `pg`, DATABASE_URL is connection string
   - Returns typed Drizzle instance

5. Scripts in package.json: `db:push`, `db:generate`, `db:migrate`, `db:studio`

**Dependencies:** `drizzle-orm`, `drizzle-kit`, `better-sqlite3`
**Optional peer dependency:** `pg` (for PostgreSQL mode)
**Depends on:** Phase 2 (for tsconfig)

---

## Phase 5: `@opentab/auth` — Authentication Upgrade

**Goal:** Extract auth config into reusable package, add email/password and OAuth.

**Changes:**

1. Create `packages/auth/` with structure:
   ```
   packages/auth/
     package.json
     tsconfig.json
     src/
       index.ts    — createAuth() factory, auth singleton export
   ```

2. Extract better-auth configuration from `app-server/src/index.ts` into `createAuth(config)`:
   ```typescript
   import { betterAuth } from "better-auth";
   import { anonymous, bearer } from "better-auth/plugins";
   import { drizzleAdapter } from "better-auth/adapters/drizzle";

   interface AuthConfig {
     db: ReturnType<typeof import("@opentab/db").createDb>;
     dbProvider: "sqlite" | "pg";
     secret: string;
     baseURL: string;
     trustedOrigins: string[];
     socialProviders?: {
       google?: { clientId: string; clientSecret: string };
       github?: { clientId: string; clientSecret: string };
     };
     cookies?: {
       sameSite?: "strict" | "lax" | "none";
       secure?: boolean;
     };
   }

   export function createAuth(config: AuthConfig) {
     return betterAuth({
       database: drizzleAdapter(config.db, { provider: config.dbProvider }),
       basePath: "/api/auth",
       secret: config.secret,
       baseURL: config.baseURL,
       trustedOrigins: config.trustedOrigins,
       emailAndPassword: { enabled: true },
       socialProviders: {
         ...config.socialProviders,
       },
       plugins: [anonymous(), bearer()],
       session: {
         cookieCache: { enabled: true, maxAge: 5 * 60 },
       },
       advanced: {
         defaultCookieAttributes: {
           sameSite: config.cookies?.sameSite ?? "lax",
           secure: config.cookies?.secure ?? true,
           httpOnly: true,
         },
       },
     });
   }
   ```

   The `auth` singleton is then created in `app-server` (not in this package) by calling `createAuth()` with env-derived config. This keeps `@opentab/auth` free of env dependencies — config is injected by the consumer.

3. Update `app-server/src/env.ts` to add OAuth + cookie env vars (all optional):
   ```typescript
   GOOGLE_CLIENT_ID: z.string().optional(),
   GOOGLE_CLIENT_SECRET: z.string().optional(),
   GITHUB_CLIENT_ID: z.string().optional(),
   GITHUB_CLIENT_SECRET: z.string().optional(),
   COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).optional(),
   COOKIE_SECURE: z.coerce.boolean().optional(),
   DB_DRIVER: z.enum(["sqlite", "pg"]).default("sqlite"),
   ```

4. Extension `lib/auth-manager.ts`: no changes. Anonymous flow preserved as-is.

**Dependencies:** `better-auth`, `@opentab/db`
**Depends on:** Phase 4

---

## Phase 6: `@opentab/api` — tRPC Router

**Goal:** End-to-end type-safe API layer replacing hand-written fetch calls.

**Changes:**

1. Create `packages/api/` with structure:
   ```
   packages/api/
     package.json
     tsconfig.json
     src/
       index.ts         — initTRPC, export t, router, publicProcedure, protectedProcedure
       context.ts       — createContext from Hono request via @opentab/auth
       routers/
         index.ts       — appRouter aggregation, AppRouter type export
         health.ts      — healthCheck query (public)
         workspace.ts   — placeholder for sync
         collection.ts  — placeholder for sync
         tab.ts         — placeholder for sync
   ```

2. Context creation (`context.ts`):
   ```typescript
   import type { Auth } from "@opentab/auth";

   export function createContextFactory(auth: Auth) {
     return async function createContext(req: Request) {
       const session = await auth.api.getSession({ headers: req.headers });
       return { session, user: session?.user ?? null };
     };
   }
   ```
   The `auth` instance is injected by the consumer (`app-server`), keeping `@opentab/api` free of singleton dependencies. This mirrors the config-injection pattern from Phase 5.

3. Procedure middleware:
   - `publicProcedure`: no auth required
   - `protectedProcedure`: middleware checks `ctx.session`, throws UNAUTHORIZED if null

4. Initial router:
   ```typescript
   export const appRouter = router({
     healthCheck: publicProcedure.query(() => ({ status: "ok", timestamp: Date.now() })),
     // workspace, collection, tab routers merged here when sync is implemented
   });
   export type AppRouter = typeof appRouter;
   ```

**Dependencies:** `@trpc/server`, `@trpc/client`, `@opentab/auth`, `@opentab/db`, `zod`
**Depends on:** Phase 4, 5

---

## Phase 7: `@opentab/ui` — Shared Component Library

**Goal:** Extract shadcn/ui components for cross-app reuse (extension + web).

**Changes:**

1. Create `packages/ui/` with structure:
   ```
   packages/ui/
     package.json
     tsconfig.json
     src/
       components/     — all shadcn components migrated from app-extension
         button.tsx
         dialog.tsx
         input.tsx
         dropdown-menu.tsx
         popover.tsx
         context-menu.tsx
         alert-dialog.tsx
         ... (all existing shadcn components)
       lib/
         utils.ts      — cn() only (NOT compareByOrder/computeOrderBetween)
       styles/
         globals.css   — @import "tailwindcss" + @theme inline { ... } (oklch tokens, radius, shadcn vars)
   ```

2. Package.json exports (per-component granularity):
   ```json
   {
     "exports": {
       "./components/button": "./src/components/button.tsx",
       "./components/dialog": "./src/components/dialog.tsx",
       "./components/input": "./src/components/input.tsx",
       "./lib/utils": "./src/lib/utils.ts",
       "./globals.css": "./src/styles/globals.css"
     }
   }
   ```

3. Internal component references changed to relative paths:
   - `dialog.tsx` importing Button: `import { Button } from "./button"` (not `@/components/ui/button`)
   - `alert-dialog.tsx` importing Button: same pattern

4. CSS responsibility split:
   - **`packages/ui/src/styles/globals.css`** (complete design system):
     - `@import "tailwindcss"`
     - `@import "tw-animate-css"`
     - `@import "shadcn/tailwind.css"`
     - `@theme inline { ... }` with oklch color tokens, radius scale, shadcn vars
     - `:root { ... }` and `.dark { ... }` CSS custom property blocks (70+ variables: --background, --foreground, --primary, --card, --popover, --muted, --accent, --destructive, --border, --ring, --sidebar-*, --chart-*, etc.)
     - `@layer base { ... }` rules (border-border defaults, body bg/text)
   - **`app-extension/src/assets/main.css`** (app-level only):
     - `@import "@opentab/ui/globals.css"`
     - `@source "../../../packages/ui"` (Tailwind v4 source scanning for packages/ui classes)
     - `@custom-variant dark (...)`
     - Any extension-specific style overrides (if any)
   - **`app-web/src/app.css`** (Phase 10, same pattern):
     - `@import "@opentab/ui/globals.css"`
     - `@source "../../../packages/ui"`
     - Web-app-specific overrides

   This ensures both extension and web app inherit all design tokens from the shared package.

5. `app-extension/src/lib/utils.ts` retains `compareByOrder()` and `computeOrderBetween()` (business logic, not UI).

**Dependencies:** `react`, `@radix-ui/*` (existing primitives), `tailwind-merge`, `clsx`, `class-variance-authority`
**Depends on:** Phase 2 (for tsconfig)

---

## Phase 8: `app-server` Refactor

**Goal:** Server becomes a thin shell consuming the new packages.

**Changes:**

1. Rewrite `src/index.ts` — this is where all packages are wired together:
   ```typescript
   import { Hono } from "hono";
   import { cors } from "hono/cors";
   import { logger } from "hono/logger";
   import { trpcServer } from "@hono/trpc-server";
   import { createAuth } from "@opentab/auth";
   import { createDb } from "@opentab/db";
   import { appRouter, createContextFactory } from "@opentab/api";
   import { env } from "./env";

   // Wire up: db → auth → api context
   const db = createDb({ driver: env.DB_DRIVER });
   const auth = createAuth({
     db,
     dbProvider: env.DB_DRIVER,
     secret: env.BETTER_AUTH_SECRET,
     baseURL: env.BETTER_AUTH_URL,
     trustedOrigins: [
       ...env.TRUSTED_ORIGINS,
       ...env.TRUSTED_EXTENSION_ORIGINS,
     ],
     socialProviders: {
       ...(env.GOOGLE_CLIENT_ID && {
         google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! },
       }),
       ...(env.GITHUB_CLIENT_ID && {
         github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET! },
       }),
     },
     cookies: {
       sameSite: env.COOKIE_SAME_SITE,
       secure: env.COOKIE_SECURE,
     },
   });
   const createContext = createContextFactory(auth);

   const app = new Hono();

   app.use("*", logger());
   app.use("*", cors({
     origin: [...env.TRUSTED_ORIGINS, ...env.TRUSTED_EXTENSION_ORIGINS],
     credentials: true,
     allowHeaders: ["Content-Type", "Authorization"],
     allowMethods: ["GET", "POST", "OPTIONS"],
   }));

   // Auth routes
   app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw));

   // tRPC routes
   app.use("/trpc/*", trpcServer({
     router: appRouter,
     createContext: ({ req }) => createContext(req),
   }));

   // Health check (single endpoint, extension calls this)
   app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));
   ```

2. Consolidate `src/app.ts` (Hono app, CORS, routes) and `src/auth.ts` (better-auth config) into `src/index.ts`. Current codebase splits across three files:
   - `src/index.ts` — only the `serve()` call (6 lines)
   - `src/app.ts` — Hono app, CORS middleware, auth routes, health endpoint (32 lines)
   - `src/auth.ts` — better-auth configuration (13 lines)

   After refactor: `src/index.ts` contains the full wired-up app + `serve()`. `src/app.ts` and `src/auth.ts` are deleted (logic moved to `@opentab/auth`, `@opentab/api`, and the new `src/index.ts`).

3. Add dependency: `@hono/trpc-server`
4. Remove direct dependency: `better-sqlite3` (now via `@opentab/db`)
5. Update existing vitest tests to work with new imports

**Files modified:** `app-server/src/index.ts`, `app-server/src/env.ts`, `app-server/package.json`
**Files deleted:** `app-server/src/app.ts` (merged into index.ts), `app-server/src/auth.ts` (moved to `@opentab/auth`)
**Depends on:** Phase 3, 4, 5, 6

---

## Phase 9: `app-extension` Refactor

**Goal:** Integrate tRPC client and consume shared UI package.

**Changes:**

1. Add `src/lib/trpc.ts` — tRPC client setup:
   ```typescript
   import type { AppRouter } from "@opentab/api";
   import { createTRPCClient, httpLink } from "@trpc/client";
   import { getSettings } from "./settings";
   import { getAuthState } from "./auth-storage";

   export async function createExtensionTRPCClient() {
     // Pre-fetch settings (async) so url callback can be synchronous
     const settings = await getSettings();

     return createTRPCClient<AppRouter>({
       links: [
         httpLink({
           url: `${settings.server_url}/trpc`,
           headers: async () => {
             const auth = await getAuthState();
             if (auth?.mode === "online") {
               return { Authorization: `Bearer ${auth.sessionToken}` };
             }
             return {};
           },
         }),
       ],
     });
   }
   ```
   - Uses `httpLink` (not `httpBatchLink`) to avoid batch CORS issues with chrome-extension:// origin.
   - `getSettings()` is async (Dexie), so settings are pre-fetched at client creation time rather than in the synchronous `url` callback. If server_url changes, the client must be re-created.

2. Replace hand-written fetch in `src/lib/api.ts`:
   - `checkServerHealth()` → `trpcClient.healthCheck.query()`
   - Future sync operations use typed procedure calls

3. UI import migration (21+ files):
   - `@/components/ui/*` → `@opentab/ui/components/*`
   - `@/lib/utils` (cn only) → `@opentab/ui/lib/utils`
   - Migration strategy: update wxt.config.ts vite aliases if needed for transitional support

4. Delete `app-extension/src/components/ui/` directory (all components now in `@opentab/ui`)

5. `src/assets/main.css` updated per Phase 7 CSS split.

**What does NOT change:**
- Zustand store (`app-store.ts`) — no structural changes
- Dexie schema (`lib/db.ts`) — no changes
- @dnd-kit drag-and-drop logic — no changes
- i18n setup — no changes
- WXT config (`wxt.config.ts`) — permissions, entrypoints, chrome_url_overrides unchanged
- Entrypoint structure (background.ts, tabs/, settings/, import/) — unchanged

**Depends on:** Phase 6, 7

---

## Phase 10: `app-web` — Lightweight Management Panel

**Goal:** Browser-based read-only view of synced data + account management.

**Tech stack:**
- React 19 + Vite
- TanStack Router (file-based, type-safe routing)
- TanStack React Query (data fetching + caching)
- tRPC via `createTRPCOptionsProxy` + `@trpc/tanstack-react-query` (proxy-based, no React context needed)
- `@opentab/ui` (shared component library)
- Tailwind CSS v4
- better-auth client (`createAuthClient`)

**Directory structure:**
```
app-web/
  package.json
  tsconfig.json             — extends @opentab/config/tsconfig.base.json
  vite.config.ts            — @tailwindcss/vite + @tanstack/router-plugin + @vitejs/plugin-react
  src/
    main.tsx                — React root, inject { trpc, queryClient } into router context
    app.css                 — @import "@opentab/ui/globals.css" + app styles
    lib/
      auth-client.ts        — createAuthClient({ baseURL: server })
      trpc.ts               — trpcClient + trpc proxy (createTRPCOptionsProxy)
      query-client.ts       — QueryClient config + global error toast via Sonner
    routes/
      __root.tsx            — root layout (header, theme provider, Sonner toast, dev tools)
      index.tsx             — public landing page
      login.tsx             — email/password + OAuth buttons (Google, GitHub)
      signup.tsx            — registration form
      dashboard.tsx         — protected route, displays synced workspaces/collections/tabs
    components/
      header.tsx            — nav links + UserMenu + ThemeToggle
      sign-in-form.tsx      — email/password login form
      sign-up-form.tsx      — registration form
      user-menu.tsx         — dropdown with account info + sign out
      theme-toggle.tsx      — light/dark/system toggle
```

**Router context pattern** (from shiprails-ext):
- `main.tsx` creates router with `context: { trpc, queryClient }`
- Routes access via `useRouteContext()`
- `beforeLoad` uses `authClient.getSession()` (async call, not a hook) for auth guards

**Functionality:**
- **Data: read-only** — view synced workspaces, collections, tabs. No editing (editing happens in extension).
- **Account: writable** — change password, bind/unbind OAuth providers (Google, GitHub).
- Login/signup with email+password or OAuth.
- No tab editing, no drag-and-drop, no import/export, no real-time sync (refresh to get latest).
- Pure SPA (no SSR), Vite build to `dist/`.

**Dependencies:** `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `@trpc/client`, `@trpc/tanstack-react-query`, `@opentab/api`, `@opentab/ui`, `better-auth/client`, `sonner`, `next-themes`, `lucide-react`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@tanstack/router-plugin`

**Depends on:** Phase 5, 6, 7

---

## Execution Order

Serial execution in a single workspace:

```
Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
```

**Dependency graph:**
```
Phase 1 (hooks)          independent
Phase 2 (config)         independent
Phase 3 (env)            independent
       ↓
Phase 4 (db)          ← Phase 2
       ↓
Phase 5 (auth)        ← Phase 4
       ↓
Phase 6 (api)         ← Phase 4, 5
Phase 7 (ui)          ← Phase 2
       ↓                  ↓
Phase 8 (server)      ← Phase 3, 4, 5, 6
Phase 9 (extension)   ← Phase 6, 7
Phase 10 (web)        ← Phase 5, 6, 7
```

## Verification Strategy

Each phase must pass before proceeding:
- **Phase 1:** `pnpm format` runs clean, pre-commit hook triggers on staged files
- **Phase 2:** `pnpm lint` passes across all packages with new tsconfig paths
- **Phase 3:** Server starts and fails fast on missing required env vars
- **Phase 4:** `db:push` creates tables, `db:studio` shows schema
- **Phase 5:** Anonymous auth still works, email signup creates user, OAuth skipped without env vars
- **Phase 6:** tRPC healthCheck query returns from client
- **Phase 7:** `pnpm --filter @opentab/extension build` succeeds with new UI imports
- **Phase 8:** Server starts, `/api/health` responds, `/trpc/healthCheck` responds, auth routes work
- **Phase 9:** Extension builds, loads in Chrome, all existing functionality works
- **Phase 10:** Web app builds, login/signup works, dashboard shows data
