# OpenTab Monorepo Architecture Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the OpenTab monorepo from a 3-package layout to a modular 8-package architecture with tRPC, Drizzle ORM, expanded auth, shared UI library, and a lightweight web management panel.

**Architecture:** Bottom-up: infrastructure (hooks, config, env) → data layer (db, auth) → API layer (tRPC) → UI library → app refactors (server, extension) → new web app. Each phase produces working, testable software. Config injection pattern: packages expose factory functions, app-server wires them together.

**Tech Stack:** pnpm workspaces, Turborepo, Biome, lefthook, Drizzle ORM, better-auth, tRPC, shadcn/ui (Radix), TanStack Router/Query, Hono, WXT, React 19, Tailwind CSS v4

**Important context:** This repo is a **git worktree** — `.git` is a file, not a directory.

---

## File Structure Overview

### New packages to create:
```
packages/config/            — shared tsconfig (Phase 2)
  package.json
  tsconfig.base.json

packages/db/                — Drizzle ORM + schema (Phase 4)
  package.json
  tsconfig.json
  drizzle.config.ts
  src/index.ts
  src/schema/index.ts
  src/schema/auth.ts
  src/schema/sync.ts

packages/auth/              — better-auth factory (Phase 5)
  package.json
  tsconfig.json
  src/index.ts

packages/api/               — tRPC router (Phase 6)
  package.json
  tsconfig.json
  src/trpc.ts              — initTRPC, publicProcedure, protectedProcedure (leaf module, no internal imports)
  src/index.ts             — re-exports from trpc.ts + routers + context
  src/context.ts
  src/routers/index.ts
  src/routers/health.ts

packages/ui/                — shadcn component library (Phase 7)
  package.json
  tsconfig.json
  src/lib/utils.ts
  src/styles/globals.css
  src/components/{11 files migrated from app-extension}

app-web/                    — lightweight web panel (Phase 10)
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/main.tsx
  src/app.css
  src/lib/auth-client.ts
  src/lib/trpc.ts
  src/lib/query-client.ts
  src/routes/__root.tsx
  src/routes/index.tsx
  src/routes/login.tsx
  src/routes/dashboard.tsx
  src/components/header.tsx
```

### Files to modify:
```
lefthook.yml                — new (Phase 1)
biome.json                  — add useSortedClasses (Phase 1)
package.json                — add lefthook, postinstall (Phase 1)
pnpm-workspace.yaml         — no change needed (app-* glob covers app-web)

app-extension/tsconfig.json — extends @opentab/config (Phase 2)
app-server/tsconfig.json    — extends @opentab/config (Phase 2)
packages/shared/tsconfig.json — extends @opentab/config (Phase 2)

app-server/src/env.ts       — rewrite with t3-env + zod (Phase 3)
app-server/src/app.ts       — full rewrite, wire all packages (Phase 8)
app-server/src/index.ts     — serve() only, imports app from app.ts (Phase 8)
app-server/package.json     — add/remove deps (Phase 3, 8)

app-extension/src/lib/trpc.ts        — new tRPC client (Phase 9)
app-extension/src/lib/api.ts         — replace fetch with tRPC (Phase 9)
app-extension/src/lib/utils.ts       — remove cn(), keep business logic (Phase 9)
app-extension/src/assets/main.css    — slim down, import globals (Phase 9)
app-extension/package.json           — add @opentab/ui, @trpc/client (Phase 9)
app-extension/src/components/ui/*    — delete all (Phase 9)
21+ files importing @/components/ui/* — update imports (Phase 9)
12+ files importing cn from @/lib/utils — update imports (Phase 9)
```

### Files to delete:
```
tsconfig.base.json          — moved to packages/config (Phase 2)
app-server/src/auth.ts      — moved to @opentab/auth (Phase 8)
app-extension/src/components/ui/*.tsx — moved to @opentab/ui (Phase 9)
```

---

## Phase 1: Git Hooks + Biome Enhancement

### Task 1.1: Install lefthook and create pre-commit config

**Files:**
- Modify: `package.json`
- Create: `lefthook.yml`

- [ ] **Step 1: Install lefthook**

```bash
pnpm add -D lefthook -w
```

- [ ] **Step 2: Install lefthook git hooks**

```bash
npx lefthook install
```

Expected: Prints `SERVED SUCCESSFULLY` or similar. Works in worktree mode (lefthook v1.6+ handles `.git` files natively).

- [ ] **Step 3: Create `lefthook.yml`**

```yaml
pre-commit:
  commands:
    biome-check:
      glob: "*.{ts,tsx,js,json,css}"
      run: npx @biomejs/biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}
      stage_fixed: true
```

- [ ] **Step 4: Add postinstall script to `package.json`**

In root `package.json`, add to scripts:

```json
"postinstall": "lefthook install"
```

- [ ] **Step 5: Verify hook fires**

```bash
echo 'const x = 1 ;' > /tmp/test-biome.ts && cp /tmp/test-biome.ts test-biome.ts
git add test-biome.ts
git commit -m "test: hook fires"
cat test-biome.ts
```

Expected: File shows `const x = 1;` (space removed by Biome). Clean up:

```bash
git rm test-biome.ts && git commit -m "chore: remove hook test file"
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lefthook.yml
git commit -m "chore: add lefthook pre-commit with biome check"
```

### Task 1.2: Add Tailwind class sorting rule

**Files:**
- Modify: `biome.json`

- [ ] **Step 1: Add `useSortedClasses` to biome.json**

In `biome.json`, add `nursery` block inside `linter.rules` (after the `style` block):

```json
"nursery": {
  "useSortedClasses": "warn"
}
```

Full `linter` section becomes:

```json
"linter": {
  "rules": {
    "recommended": true,
    "style": {
      "noNonNullAssertion": "off"
    },
    "nursery": {
      "useSortedClasses": "warn"
    }
  }
}
```

- [ ] **Step 2: Verify rule is active**

```bash
pnpm check
```

Expected: No config errors. May report `useSortedClasses` warnings on existing `.tsx` files — expected and correct.

- [ ] **Step 3: Commit**

```bash
git add biome.json
git commit -m "chore: add useSortedClasses rule for Tailwind class sorting"
```

---

## Phase 2: `@opentab/config` — Shared TypeScript Configuration

### Task 2.1: Create config package and migrate tsconfig

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.base.json`
- Modify: `app-extension/tsconfig.json`
- Modify: `app-server/tsconfig.json`
- Modify: `packages/shared/tsconfig.json`
- Delete: `tsconfig.base.json` (root)

- [ ] **Step 1: Create `packages/config/package.json`**

```json
{
  "name": "@opentab/config",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 2: Move root `tsconfig.base.json` to `packages/config/tsconfig.base.json`**

```bash
mv tsconfig.base.json packages/config/tsconfig.base.json
```

Content stays identical:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Update `app-extension/tsconfig.json`**

Change `"extends"` from `"../tsconfig.base.json"` to `"@opentab/config/tsconfig.base.json"`:

```json
{
  "extends": "@opentab/config/tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", ".wxt/wxt.d.ts"],
  "exclude": ["node_modules", ".output"]
}
```

- [ ] **Step 4: Update `app-server/tsconfig.json`**

Change `"extends"` from `"../tsconfig.base.json"` to `"@opentab/config/tsconfig.base.json"`:

```json
{
  "extends": "@opentab/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false,
    "declaration": false,
    "declarationMap": false
  },
  "include": ["src"],
  "exclude": ["src/__tests__"]
}
```

- [ ] **Step 5: Update `packages/shared/tsconfig.json`**

Change `"extends"` from `"../../tsconfig.base.json"` to `"@opentab/config/tsconfig.base.json"`:

```json
{
  "extends": "@opentab/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Run `pnpm install` to link the new package**

```bash
pnpm install
```

- [ ] **Step 7: Verify TypeScript resolution works**

```bash
pnpm lint
```

Expected: All packages compile without errors. The `@opentab/config` package is resolved via pnpm workspace.

- [ ] **Step 8: Commit**

```bash
git add packages/config/ app-extension/tsconfig.json app-server/tsconfig.json packages/shared/tsconfig.json pnpm-lock.yaml
git rm tsconfig.base.json
git commit -m "refactor: move tsconfig to @opentab/config package"
```

---

## Phase 3: Environment Variable Validation

### Task 3.1: Replace hand-written env.ts with t3-env + Zod

**Files:**
- Modify: `app-server/package.json`
- Modify: `app-server/src/env.ts`

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @opentab/server add @t3-oss/env-core zod
```

- [ ] **Step 2: Rewrite `app-server/src/env.ts`**

Replace the entire file with:

```typescript
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const splitComma = (v: string | undefined) =>
  v?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
    TRUSTED_ORIGINS_RAW: z.string().optional(),
    TRUSTED_EXTENSION_ORIGINS_RAW: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnvStrict: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    TRUSTED_ORIGINS_RAW: process.env.TRUSTED_ORIGINS,
    TRUSTED_EXTENSION_ORIGINS_RAW: process.env.TRUSTED_EXTENSION_ORIGINS,
    NODE_ENV: process.env.NODE_ENV,
  },
});

/**
 * Merged trusted origins array — preserves the existing API contract.
 * `app.ts` uses `env.TRUSTED_ORIGINS.includes(origin)` which continues to work.
 */
const TRUSTED_ORIGINS = [
  ...splitComma(env.TRUSTED_ORIGINS_RAW),
  ...splitComma(env.TRUSTED_EXTENSION_ORIGINS_RAW),
];

export { TRUSTED_ORIGINS };
```

Note: We use `runtimeEnvStrict` to map env var names (e.g. `TRUSTED_ORIGINS` in `.env` → `TRUSTED_ORIGINS_RAW` in code), then compute the merged array outside `createEnv` since t3-env `.transform()` doesn't compose well with merging two vars. The exported `TRUSTED_ORIGINS` is `string[]`, same as the current contract.

Also update both consumers of `env.TRUSTED_ORIGINS`:

**`app-server/src/app.ts`** — CORS check:
```typescript
import { env, TRUSTED_ORIGINS } from "./env.js";
// ...in CORS origin callback:
if (TRUSTED_ORIGINS.includes(origin)) return origin;
```

**`app-server/src/auth.ts`** — trustedOrigins config (line 11 currently uses `env.TRUSTED_ORIGINS`):
```typescript
import { env, TRUSTED_ORIGINS } from "./env.js";
// ...
trustedOrigins: TRUSTED_ORIGINS,
```

- [ ] **Step 3: Update vitest config secret to meet min 32 chars**

The current `BETTER_AUTH_SECRET` in `app-server/vitest.config.ts` is `"test-secret-for-vitest"` (22 chars). Update to 32+ chars:

In `app-server/vitest.config.ts`, change:
```typescript
BETTER_AUTH_SECRET: "test-secret-for-vitest",
```
to:
```typescript
BETTER_AUTH_SECRET: "test-secret-for-vitest-min-32-chars!!",
```

- [ ] **Step 4: Verify server starts with valid env**

```bash
cd app-server && pnpm dev
```

Expected: Server starts on port 3001. If `.env` is missing `BETTER_AUTH_SECRET`, it should fail immediately with a Zod validation error.

- [ ] **Step 5: Run existing tests**

```bash
cd app-server && pnpm test
```

Expected: All 3 tests in `auth.test.ts` pass.

- [ ] **Step 6: Commit**

```bash
git add app-server/src/env.ts app-server/src/app.ts app-server/vitest.config.ts app-server/package.json pnpm-lock.yaml
git commit -m "refactor: replace hand-written env validation with t3-env + zod"
```

---

## Phase 4: `@opentab/db` — Drizzle ORM

### Task 4.1: Create db package with Drizzle schema

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/schema/auth.ts`
- Create: `packages/db/src/schema/sync.ts`

- [ ] **Step 1: Create `packages/db/package.json`**

```json
{
  "name": "@opentab/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "better-sqlite3": "^12.8.0",
    "drizzle-orm": "^0.45.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "drizzle-kit": "^0.31.0",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "@opentab/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/db/drizzle.config.ts`**

```typescript
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? resolve(__dirname, "../../app-server/data/auth.db"),
  },
});
```

- [ ] **Step 4: Create `packages/db/src/schema/auth.ts`**

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isAnonymous: integer("isAnonymous", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$onUpdateFn(() => new Date()),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
```

- [ ] **Step 5: Create `packages/db/src/schema/sync.ts`**

```typescript
// Placeholder: workspace, collection, tab sync tables
// Will be implemented when server-side data sync is added
```

- [ ] **Step 6: Create `packages/db/src/schema/index.ts`**

```typescript
export * from "./auth.js";
// export * from "./sync.js"; // Uncomment when sync tables are implemented
```

- [ ] **Step 7: Create `packages/db/src/index.ts`**

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

export interface DbConfig {
  driver?: "sqlite" | "pg";
  url?: string;
}

export function createDb(config: DbConfig = {}) {
  const driver = config.driver ?? "sqlite";

  if (driver === "pg") {
    throw new Error("PostgreSQL support not yet implemented. Install pg and add pg dialect.");
  }

  const url = config.url ?? "./data/auth.db";
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");

  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;

export { schema };
```

- [ ] **Step 8: Install dependencies and verify**

```bash
pnpm install
```

Expected: `@opentab/db` package is linked in the workspace.

- [ ] **Step 9: Verify schema compiles**

```bash
cd packages/db && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add packages/db/
git commit -m "feat: add @opentab/db package with Drizzle ORM and auth schema"
```

---

## Phase 5: `@opentab/auth` — Authentication Upgrade

### Task 5.1: Create auth package with factory function

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/index.ts`
- Modify: `app-server/src/env.ts` (add OAuth + cookie vars)

- [ ] **Step 1: Create `packages/auth/package.json`**

```json
{
  "name": "@opentab/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@opentab/db": "workspace:*",
    "better-auth": "^1.5.6"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `packages/auth/tsconfig.json`**

```json
{
  "extends": "@opentab/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/auth/src/index.ts`**

```typescript
import type { Db } from "@opentab/db";
import { betterAuth } from "better-auth";
import { anonymous, bearer } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export interface AuthConfig {
  db: Db;
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

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 4: Add OAuth and cookie env vars to `app-server/src/env.ts`**

Add these fields inside the `server` object, after `NODE_ENV`:

```typescript
    DB_DRIVER: z.enum(["sqlite", "pg"]).default("sqlite"),
    DATABASE_URL: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).optional(),
    COOKIE_SECURE: z.coerce.boolean().optional(),
```

**Also add the corresponding `runtimeEnvStrict` entries** (Phase 3 uses `runtimeEnvStrict`, so every new `server` key must have a mapping):

```typescript
    DB_DRIVER: process.env.DB_DRIVER,
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE,
    COOKIE_SECURE: process.env.COOKIE_SECURE,
```

- [ ] **Step 5: Install and verify**

```bash
pnpm install
cd packages/auth && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/auth/ app-server/src/env.ts
git commit -m "feat: add @opentab/auth package with email/password and OAuth support"
```

---

## Phase 6: `@opentab/api` — tRPC Router

### Task 6.1: Create api package with tRPC router

**Files:**
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Create: `packages/api/src/index.ts`
- Create: `packages/api/src/context.ts`
- Create: `packages/api/src/routers/index.ts`
- Create: `packages/api/src/routers/health.ts`

- [ ] **Step 1: Create `packages/api/package.json`**

```json
{
  "name": "@opentab/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@opentab/auth": "workspace:*",
    "@opentab/db": "workspace:*",
    "@trpc/server": "^11.13.4",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `packages/api/tsconfig.json`**

```json
{
  "extends": "@opentab/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/api/src/trpc.ts`** (leaf module — no internal imports, avoids circular deps)

```typescript
import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.user! } });
});
```

- [ ] **Step 4: Create `packages/api/src/index.ts`** (pure re-export barrel — imports from trpc.ts and routers, no definitions here)

```typescript
export { router, publicProcedure, protectedProcedure } from "./trpc.js";
export { appRouter, type AppRouter } from "./routers/index.js";
export { createContextFactory, type Context } from "./context.js";
```

- [ ] **Step 5: Create `packages/api/src/context.ts`**

```typescript
import type { Auth } from "@opentab/auth";

export interface Context {
  session: Awaited<ReturnType<Auth["api"]["getSession"]>>;
  user: Awaited<ReturnType<Auth["api"]["getSession"]>> extends { user: infer U } | null ? U | null : never;
}

export function createContextFactory(auth: Auth) {
  return async function createContext(req: Request): Promise<Context> {
    const session = await auth.api.getSession({ headers: req.headers });
    return {
      session,
      user: session?.user ?? null,
    };
  };
}
```

- [ ] **Step 6: Create `packages/api/src/routers/health.ts`**

```typescript
import { publicProcedure, router } from "../trpc.js";

export const healthRouter = router({
  check: publicProcedure.query(() => ({
    status: "ok" as const,
    timestamp: Date.now(),
  })),
});
```

- [ ] **Step 7: Create `packages/api/src/routers/index.ts`**

```typescript
import { router } from "../trpc.js";
import { healthRouter } from "./health.js";

export const appRouter = router({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 8: Install and verify**

```bash
pnpm install
cd packages/api && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add packages/api/
git commit -m "feat: add @opentab/api package with tRPC router and health endpoint"
```

---

## Phase 7: `@opentab/ui` — Shared Component Library

### Task 7.1: Create ui package structure

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/lib/utils.ts`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@opentab/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./components/alert-dialog": "./src/components/alert-dialog.tsx",
    "./components/button": "./src/components/button.tsx",
    "./components/card": "./src/components/card.tsx",
    "./components/checkbox": "./src/components/checkbox.tsx",
    "./components/context-menu": "./src/components/context-menu.tsx",
    "./components/dialog": "./src/components/dialog.tsx",
    "./components/dropdown-menu": "./src/components/dropdown-menu.tsx",
    "./components/input": "./src/components/input.tsx",
    "./components/popover": "./src/components/popover.tsx",
    "./components/switch": "./src/components/switch.tsx",
    "./components/tooltip": "./src/components/tooltip.tsx",
    "./lib/utils": "./src/lib/utils.ts",
    "./globals.css": "./src/styles/globals.css"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.7.0",
    "radix-ui": "^1.4.3",
    "react": "^19",
    "tailwind-merge": "^3.5.0"
  },
  "devDependencies": {
    "@types/react": "^19",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "@opentab/config/tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/ui/src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Only `cn()` — NOT `compareByOrder` or `computeOrderBetween` (those are business logic and stay in `app-extension/src/lib/utils.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/package.json packages/ui/tsconfig.json packages/ui/src/lib/utils.ts
git commit -m "feat: scaffold @opentab/ui package with cn() utility"
```

### Task 7.2: Migrate UI components

**Files:**
- Create: `packages/ui/src/components/*.tsx` (11 files)
- Create: `packages/ui/src/styles/globals.css`

- [ ] **Step 1: Copy all 11 UI component files**

```bash
mkdir -p packages/ui/src/components packages/ui/src/styles
cp app-extension/src/components/ui/*.tsx packages/ui/src/components/
```

- [ ] **Step 2: Fix internal imports in all component files**

In every file under `packages/ui/src/components/`, replace:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../lib/utils.js"`
- `import { Button } from "@/components/ui/button"` → `import { Button } from "./button.js"`
- `import { buttonVariants } from "@/components/ui/button"` → `import { buttonVariants } from "./button.js"`

Files that need Button import fix: `dialog.tsx`, `alert-dialog.tsx`.
All 11 files need the `cn` import fix.

Run this to verify no `@/` imports remain:

```bash
grep -r '@/' packages/ui/src/
```

Expected: No matches.

- [ ] **Step 3: Create `packages/ui/src/styles/globals.css`**

This file contains the complete design system. Move the full content from `app-extension/src/assets/main.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --status-green: oklch(0.520 0.180 149.579);
  --status-yellow: oklch(0.600 0.180 86.047);
  --status-red: oklch(0.520 0.200 25.331);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --status-green: oklch(0.723 0.219 149.579);
  --status-yellow: oklch(0.795 0.184 86.047);
  --status-red: oklch(0.637 0.237 25.331);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 4: Install and verify**

```bash
pnpm install
cd packages/ui && npx tsc --noEmit
```

Expected: No TypeScript errors. All components compile with relative imports.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/
git commit -m "feat: add @opentab/ui with migrated shadcn components and design tokens"
```

---

## Phase 8: `app-server` Refactor

### Task 8.1: Rewrite server as thin shell

**Files:**
- Modify: `app-server/package.json`
- Modify: `app-server/src/app.ts` (full rewrite — wire db/auth/api packages)
- Modify: `app-server/src/index.ts` (slim to serve() only)
- Modify: `app-server/src/__tests__/auth.test.ts`
- Delete: `app-server/src/auth.ts` (moved to @opentab/auth)

- [ ] **Step 1: Update `app-server/package.json` dependencies**

Add:
```json
"@opentab/auth": "workspace:*",
"@opentab/db": "workspace:*",
"@opentab/api": "workspace:*",
"@hono/trpc-server": "^0.3.4"
```

Remove from dependencies:
```json
"better-sqlite3": "^12.8.0"
```

Remove from devDependencies:
```json
"@types/better-sqlite3": "^7.6.13"
```

(These are now provided by `@opentab/db`.)

```bash
pnpm --filter @opentab/server add '@opentab/auth@workspace:*' '@opentab/db@workspace:*' '@opentab/api@workspace:*' @hono/trpc-server
pnpm --filter @opentab/server remove better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Rewrite `app-server/src/app.ts`** (pure app construction — no `serve()`, safe to import in tests)

Replace the entire file with:

```typescript
import { trpcServer } from "@hono/trpc-server";
import { createAuth } from "@opentab/auth";
import { createDb } from "@opentab/db";
import { appRouter, createContextFactory } from "@opentab/api";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env, TRUSTED_ORIGINS } from "./env.js";

// Wire up: db → auth → api context
const db = createDb({
  driver: env.DB_DRIVER,
  url: env.DATABASE_URL,
});

const auth = createAuth({
  db,
  dbProvider: env.DB_DRIVER,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: TRUSTED_ORIGINS,
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

export const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (TRUSTED_ORIGINS.includes(origin)) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

app.use("/trpc/*", trpcServer({
  router: appRouter,
  createContext: ({ req }) => createContext(req),
}));

app.get("/api/health", (c) =>
  c.json({ status: "ok" as const, timestamp: Date.now() }),
);
```

- [ ] **Step 3: Rewrite `app-server/src/index.ts`** (entry point — only `serve()`, kept separate so tests import `app.ts` without side effects)

Replace the entire file with:

```typescript
import { serve } from "@hono/node-server";
import { app } from "./app.js";

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

- [ ] **Step 4: Update test file**

The test file `app-server/src/__tests__/auth.test.ts` keeps importing from `"../app.js"` (no side effects). Update test content to add tRPC + health tests:

```typescript
import { describe, expect, it } from "vitest";
import { app } from "../app.js";

describe("anonymous auth", () => {
  it("POST /api/auth/sign-in/anonymous returns user and token", async () => {
    const res = await app.request("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeTypeOf("string");
    expect(body.user.isAnonymous).toBe(true);
    expect(body.token).toBeTypeOf("string");
  });

  it("GET /api/auth/get-session with Bearer token returns session", async () => {
    const signInRes = await app.request("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const signInBody = await signInRes.json();
    const token = signInRes.headers.get("set-auth-token") ?? signInBody.token;

    const sessionRes = await app.request("/api/auth/get-session", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(sessionRes.ok).toBe(true);

    const sessionBody = await sessionRes.json();
    expect(sessionBody.user).toBeDefined();
    expect(sessionBody.session).toBeDefined();
  });

  it("GET /api/auth/get-session without token returns no session", async () => {
    const res = await app.request("/api/auth/get-session");
    const body = await res.json();
    expect(body === null || body?.session === null).toBe(true);
  });

  it("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeTypeOf("number");
  });

  it("GET /trpc/health.check returns ok via tRPC", async () => {
    const res = await app.request("/trpc/health.check");
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.result.data.status).toBe("ok");
  });
});
```

- [ ] **Step 5: Delete old auth file**

```bash
rm app-server/src/auth.ts
```

- [ ] **Step 6: Run tests**

```bash
cd app-server && pnpm test
```

Expected: All 5 tests pass (3 original + 2 new: health + tRPC).

- [ ] **Step 7: Commit**

```bash
git add app-server/
git rm app-server/src/auth.ts
git commit -m "refactor: rewrite app-server as thin shell consuming db/auth/api packages"
```

---

## Phase 9: `app-extension` Refactor

### Task 9.1: Add tRPC client

**Files:**
- Create: `app-extension/src/lib/trpc.ts`
- Modify: `app-extension/src/lib/api.ts`
- Modify: `app-extension/package.json`

- [ ] **Step 1: Install @trpc/client**

```bash
pnpm --filter @opentab/extension add @trpc/client '@opentab/api@workspace:*'
```

- [ ] **Step 2: Create `app-extension/src/lib/trpc.ts`**

```typescript
import type { AppRouter } from "@opentab/api";
import { createTRPCClient, httpLink } from "@trpc/client";
import { getSettings } from "./settings";
import { getAuthState } from "./auth-storage";

export async function createExtensionTRPCClient() {
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

- [ ] **Step 3: Update `app-extension/src/lib/api.ts` to use tRPC for health check**

Replace the entire file with:

```typescript
import { createExtensionTRPCClient } from "./trpc";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

interface SignInAnonymousResponse {
  token: string;
  user: { id: string; isAnonymous: boolean };
}

export async function signInAnonymous(baseUrl?: string): Promise<SignInAnonymousResponse> {
  const base = baseUrl ?? API_BASE;
  const res = await fetch(`${base}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Sign-in failed: ${res.status}`);
  }

  return res.json();
}

export async function checkHealth(baseUrl?: string): Promise<boolean> {
  try {
    if (baseUrl) {
      const res = await fetch(`${baseUrl}/api/health`);
      return res.ok;
    }
    const client = await createExtensionTRPCClient();
    const result = await client.health.check.query();
    return result.status === "ok";
  } catch {
    return false;
  }
}
```

Note: `signInAnonymous` stays as raw fetch because it's called before the tRPC client is available (it's part of auth bootstrapping). `checkHealth` uses tRPC when no explicit baseUrl is provided, falls back to raw fetch when a custom baseUrl is given.

- [ ] **Step 4: Verify extension builds**

```bash
pnpm --filter @opentab/extension build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/lib/trpc.ts app-extension/src/lib/api.ts app-extension/package.json pnpm-lock.yaml
git commit -m "feat: add tRPC client to extension, use for health check"
```

### Task 9.2: Migrate UI imports to @opentab/ui

**Files:**
- Modify: `app-extension/package.json`
- Modify: `app-extension/src/lib/utils.ts`
- Modify: `app-extension/src/assets/main.css`
- Modify: 21+ business component files (import path changes)
- Delete: `app-extension/src/components/ui/` (11 files)

- [ ] **Step 1: Add @opentab/ui dependency**

```bash
pnpm --filter @opentab/extension add '@opentab/ui@workspace:*'
```

- [ ] **Step 2: Update `app-extension/src/lib/utils.ts`**

Remove the `cn` function (now in `@opentab/ui`). Keep business logic functions:

```typescript
import { generateKeyBetween } from "fractional-indexing";

export function compareByOrder<T extends { order: string }>(a: T, b: T): number {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
}

export function computeOrderBetween<T extends { order: string }>(
  items: T[],
  oldIndex: number,
  newIndex: number,
): string {
  let lowerBound: string | null = null;
  let upperBound: string | null = null;

  if (newIndex < oldIndex) {
    lowerBound = newIndex > 0 ? items[newIndex - 1].order : null;
    upperBound = items[newIndex].order;
  } else {
    lowerBound = items[newIndex].order;
    upperBound = newIndex < items.length - 1 ? items[newIndex + 1].order : null;
  }

  return generateKeyBetween(lowerBound, upperBound);
}
```

- [ ] **Step 3: Update all UI component imports**

In every file that imports from `@/components/ui/*`, change to `@opentab/ui/components/*`.

Example transforms (apply to ALL files listed below):

```
import { Button } from "@/components/ui/button"
→ import { Button } from "@opentab/ui/components/button"

import { Dialog, DialogContent, ... } from "@/components/ui/dialog"
→ import { Dialog, DialogContent, ... } from "@opentab/ui/components/dialog"

import { Input } from "@/components/ui/input"
→ import { Input } from "@opentab/ui/components/input"
```

Files to update (exhaustive list):
- `src/entrypoints/import/App.tsx` — Button
- `src/entrypoints/settings/App.tsx` — Button, Input, Switch, cn
- `src/components/import/import-tree.tsx` — Checkbox, cn
- `src/components/import/import-summary-bar.tsx` — Button
- `src/components/import/tab-diff-list.tsx` — cn
- `src/components/collection/edit-tab-dialog.tsx` — Button, Dialog*, Input
- `src/components/collection/delete-collection-dialog.tsx` — AlertDialog*
- `src/components/collection/create-collection-dialog.tsx` — Button, Dialog*, Input
- `src/components/collection/add-tab-popover.tsx` — Button, Input, Popover*
- `src/components/collection/collection-tab-item.tsx` — Button, DropdownMenu*, cn
- `src/components/collection/collection-card.tsx` — Button, DropdownMenu*, Input, cn
- `src/components/live-tabs/save-tabs-dialog.tsx` — Button, Checkbox, Dialog*, Input
- `src/components/layout/live-tab-panel.tsx` — Button, cn
- `src/components/layout/empty-workspace.tsx` — Button
- `src/components/layout/welcome-dialog.tsx` — Button, Dialog*
- `src/components/layout/collection-panel.tsx` — Button, DropdownMenu*, Input, cn
- `src/components/layout/workspace-sidebar.tsx` — Button, cn
- `src/components/workspace/create-workspace-dialog.tsx` — Button, Dialog*, Input
- `src/components/workspace/delete-workspace-dialog.tsx` — AlertDialog*
- `src/components/workspace/workspace-item.tsx` — Button, ContextMenu*, DropdownMenu*, Input, Popover*, cn
- `src/components/workspace/icon-picker.tsx` — cn

For `cn` imports: files that import `cn` from `@/lib/utils` change to `@opentab/ui/lib/utils`. Files that import `compareByOrder` or `computeOrderBetween` keep importing from `@/lib/utils`.

Special cases:
- `src/entrypoints/settings/App.tsx` imports both `cn` (→ `@opentab/ui/lib/utils`) and may use business utils
- `src/entrypoints/tabs/App.tsx` imports `computeOrderBetween` from `@/lib/utils` — stays unchanged
- `src/stores/app-store.ts` imports `compareByOrder` from `@/lib/utils` — stays unchanged

- [ ] **Step 4: Update `app-extension/src/assets/main.css`**

Replace the entire file with:

```css
@import "@opentab/ui/globals.css";

@source "../../../packages/ui";

@custom-variant dark (&:is(.dark *));
```

- [ ] **Step 5: Delete old UI component directory**

```bash
rm -rf app-extension/src/components/ui/
```

- [ ] **Step 6: Verify no remaining @/components/ui imports**

```bash
grep -r '@/components/ui' app-extension/src/
```

Expected: No matches.

- [ ] **Step 7: Verify extension builds**

```bash
pnpm --filter @opentab/extension build
```

Expected: Build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add app-extension/
git commit -m "refactor: migrate UI imports to @opentab/ui, slim down main.css"
```

---

## Phase 10: `app-web` — Lightweight Management Panel

### Task 10.1: Scaffold web app with Vite + TanStack Router

**Files:**
- Create: `app-web/package.json`
- Create: `app-web/tsconfig.json`
- Create: `app-web/vite.config.ts`
- Create: `app-web/index.html`
- Create: `app-web/src/main.tsx`
- Create: `app-web/src/app.css`

- [ ] **Step 1: Create `app-web/package.json`**

```json
{
  "name": "@opentab/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 3002",
    "build": "vite build",
    "lint": "tsc --noEmit && biome check ."
  },
  "dependencies": {
    "@opentab/api": "workspace:*",
    "@opentab/ui": "workspace:*",
    "@tanstack/react-query": "^5.90.12",
    "@tanstack/react-router": "^1.141.1",
    "@trpc/client": "^11.13.4",
    "@trpc/tanstack-react-query": "^11.13.4",
    "better-auth": "^1.5.6",
    "lucide-react": "^1.7.0",
    "next-themes": "^0.4.6",
    "react": "^19",
    "react-dom": "^19",
    "sonner": "^2.0.7"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4",
    "@tanstack/router-plugin": "^1.141.1",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vite": "^6"
  }
}
```

- [ ] **Step 2: Create `app-web/tsconfig.json`**

```json
{
  "extends": "@opentab/config/tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `app-web/vite.config.ts`**

```typescript
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), TanStackRouterVite(), react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/trpc": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 4: Create `app-web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenTab</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `app-web/src/app.css`**

Note: `app-web/src/` is 2 levels from root (not 3 like `app-extension/src/assets/`), so the path is `../../packages/ui`.

```css
@import "@opentab/ui/globals.css";

@source "../../packages/ui";

@custom-variant dark (&:is(.dark *));
```

- [ ] **Step 6: Commit scaffold**

```bash
pnpm install
git add app-web/package.json app-web/tsconfig.json app-web/vite.config.ts app-web/index.html app-web/src/app.css pnpm-lock.yaml
git commit -m "feat: scaffold app-web with Vite, TanStack Router, Tailwind"
```

### Task 10.2: Add lib files (auth, tRPC, query client)

**Files:**
- Create: `app-web/src/lib/query-client.ts`
- Create: `app-web/src/lib/trpc.ts`
- Create: `app-web/src/lib/auth-client.ts`

- [ ] **Step 1: Create `app-web/src/lib/query-client.ts`**

```typescript
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
    mutations: {
      onError: (error) => {
        toast.error(error.message);
      },
    },
  },
});
```

- [ ] **Step 2: Create `app-web/src/lib/trpc.ts`**

```typescript
import type { AppRouter } from "@opentab/api";
import { createTRPCClient, httpLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { queryClient } from "./query-client";

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: "/trpc",
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
```

- [ ] **Step 3: Create `app-web/src/lib/auth-client.ts`**

```typescript
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: "/api/auth",
});
```

- [ ] **Step 4: Commit**

```bash
git add app-web/src/lib/
git commit -m "feat: add query client, tRPC proxy, and auth client for web app"
```

### Task 10.3: Add routes and components

**Files:**
- Create: `app-web/src/main.tsx`
- Create: `app-web/src/routes/__root.tsx`
- Create: `app-web/src/routes/index.tsx`
- Create: `app-web/src/routes/login.tsx`
- Create: `app-web/src/routes/dashboard.tsx`
- Create: `app-web/src/components/header.tsx`

- [ ] **Step 1: Create `app-web/src/main.tsx`**

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { queryClient } from "./lib/query-client";
import { trpc } from "./lib/trpc";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  context: { trpc, queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Create `app-web/src/routes/__root.tsx`**

```tsx
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Header } from "../components/header";

interface RouterContext {
  trpc: typeof import("../lib/trpc").trpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 3: Create `app-web/src/routes/index.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-col items-center gap-6 pt-20">
      <h1 className="text-4xl font-bold">OpenTab</h1>
      <p className="text-muted-foreground">Manage your browser tabs across devices.</p>
    </div>
  );
}
```

- [ ] **Step 4: Create `app-web/src/routes/login.tsx`**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@opentab/ui/components/button";
import { Input } from "@opentab/ui/components/input";
import { authClient } from "../lib/auth-client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authClient.signIn.email({ email, password });
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error("Login failed. Check your credentials.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-20">
      <h1 className="text-2xl font-bold text-center">Sign In</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Create `app-web/src/routes/dashboard.tsx`**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">
        Your synced workspaces and collections will appear here.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Create `app-web/src/components/header.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import { Button } from "@opentab/ui/components/button";

export function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold">
          OpenTab
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Sign In</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 7: Install deps, generate route tree, verify build**

```bash
pnpm install
pnpm --filter @opentab/web build
```

Expected: Vite build succeeds. `routeTree.gen.ts` is auto-generated by TanStack Router plugin.

- [ ] **Step 8: Commit**

```bash
git add app-web/
git commit -m "feat: add web app with login, dashboard, and shared UI components"
```

### Task 10.4: Update turbo.json for web app

**Files:**
- Modify: `turbo.json`

- [ ] **Step 1: Update `turbo.json` to include web app outputs**

The current `turbo.json` already handles `app-web` correctly via glob patterns (`"outputs": [".output/**", "dist/**"]`). Verify by running:

```bash
pnpm build
```

Expected: All packages build successfully, including `app-web`.

- [ ] **Step 2: Commit (only if turbo.json was changed)**

```bash
git add turbo.json
git commit -m "chore: update turbo.json for web app"
```

---

## Final Verification

- [ ] **Step 1: Full build**

```bash
pnpm build
```

Expected: All packages build successfully.

- [ ] **Step 2: Server tests**

```bash
cd app-server && pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Lint across all packages**

```bash
pnpm lint
```

Expected: No errors (warnings for `useSortedClasses` are expected).

- [ ] **Step 4: Extension loads in Chrome**

```bash
pnpm --filter @opentab/extension build
```

Load `app-extension/.output/chrome-mv3/` in Chrome as unpacked extension. Verify all existing functionality works: workspaces, collections, tabs, drag-and-drop, import/export.

- [ ] **Step 5: Web app serves locally**

```bash
pnpm --filter @opentab/web dev
```

Open `http://localhost:3002`. Verify: home page renders, login page shows form, styling from `@opentab/ui` is applied correctly (colors, fonts, dark mode tokens).
