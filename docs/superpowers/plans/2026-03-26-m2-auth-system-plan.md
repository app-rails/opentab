# M2 Auth System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous authentication via better-auth so the extension auto-creates an account on install, persists the session token in Chrome Storage, and falls back to a local UUID when the backend is unreachable.

**Architecture:** better-auth with `anonymous()` + `bearer()` plugins on a Hono server backed by SQLite. The extension's background service worker calls the sign-in endpoint on install, stores the session token in `chrome.storage.local`, and uses `chrome.alarms` to retry registration when offline. No better-auth client SDK — raw `fetch` only, since the SDK assumes browser cookies.

**Tech Stack:** better-auth, better-sqlite3, Hono CORS middleware, Chrome Storage API, Chrome Alarms API, vitest (server tests)

---

## File Structure

```
NEW   app-server/src/app.ts               — Hono app setup (CORS + auth routes + health)
NEW   app-server/src/auth.ts              — better-auth instance (anonymous + bearer plugins, SQLite)
NEW   app-server/src/env.ts               — typed env access (BETTER_AUTH_SECRET, TRUSTED_ORIGINS)
NEW   app-server/.env.example             — env template
NEW   app-server/data/.gitkeep            — SQLite db directory placeholder
NEW   app-server/src/__tests__/auth.test.ts — integration tests for anonymous sign-in
MOD   app-server/src/index.ts             — imports app from app.ts, calls serve()
MOD   app-server/package.json             — add better-auth, better-sqlite3, vitest
MOD   app-server/tsconfig.json            — exclude test files from build output

NEW   app-extension/src/lib/api.ts        — raw fetch wrapper for backend endpoints
NEW   app-extension/src/lib/auth-storage.ts — chrome.storage.local get/set for AuthState
NEW   app-extension/src/lib/auth-manager.ts — init + retry orchestration
MOD   app-extension/src/entrypoints/background.ts — onInstalled handler + alarms listener
MOD   app-extension/wxt.config.ts         — add storage + alarms permissions

MOD   packages/shared/src/types.ts        — add AuthState union type
MOD   packages/shared/src/index.ts        — export AuthState
MOD   .gitignore                          — add app-server/data/*.db
```

---

### Task 1: Server Dependencies & Environment

**Files:**
- Modify: `app-server/package.json`
- Create: `app-server/.env.example`
- Create: `app-server/src/env.ts`
- Create: `app-server/data/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Add dependencies to app-server**

```bash
# From the repository root
pnpm --filter @opentab/server add better-auth better-sqlite3
pnpm --filter @opentab/server add -D @types/better-sqlite3 vitest
```

- [ ] **Step 2: Create `app-server/.env.example`**

```env
BETTER_AUTH_SECRET=change-me-to-a-random-string
BETTER_AUTH_URL=http://localhost:3001
TRUSTED_ORIGINS=http://localhost:5173
```

- [ ] **Step 3: Create `app-server/.env` with dev values**

```env
BETTER_AUTH_SECRET=dev-secret-opentab-m2-change-in-prod
BETTER_AUTH_URL=http://localhost:3001
TRUSTED_ORIGINS=http://localhost:5173
```

- [ ] **Step 4: Create `app-server/src/env.ts`**

```ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  get BETTER_AUTH_SECRET() {
    return required("BETTER_AUTH_SECRET");
  },
  get BETTER_AUTH_URL() {
    return process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
  },
  get TRUSTED_ORIGINS() {
    return (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
} as const;
```

- [ ] **Step 5: Create `app-server/data/.gitkeep`**

Empty file. This directory will hold `auth.db` at runtime.

- [ ] **Step 6: Add SQLite db files to `.gitignore`**

Append to the root `.gitignore`:

```
# SQLite databases
app-server/data/*.db
app-server/data/*.db-journal
app-server/data/*.db-wal
```

- [ ] **Step 7: Update `app-server/package.json` scripts**

Add the `test` and `db:migrate` scripts:

```json
"scripts": {
  "dev": "tsx watch --env-file=.env src/index.ts",
  "build": "tsc",
  "lint": "tsc --noEmit && biome check .",
  "test": "node --env-file=.env ./node_modules/.bin/vitest run",
  "db:migrate": "npx @better-auth/cli migrate"
}
```

Note: the `dev` script now uses `--env-file=.env` so `process.env` picks up the `.env` file. Node 22 supports `--env-file` natively via tsx.

- [ ] **Step 8: Commit**

```bash
git add app-server/package.json app-server/.env.example app-server/src/env.ts app-server/data/.gitkeep .gitignore pnpm-lock.yaml
git commit -m "chore(server): add better-auth deps, env config, and SQLite data dir"
```

---

### Task 2: better-auth Configuration

**Files:**
- Create: `app-server/src/auth.ts`

- [ ] **Step 1: Create `app-server/src/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";
import Database from "better-sqlite3";
import { env } from "./env.js";

export const auth = betterAuth({
  database: new Database("./data/auth.db"),
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.TRUSTED_ORIGINS,
  plugins: [anonymous(), bearer()],
});
```

- [ ] **Step 2: Commit**

```bash
git add app-server/src/auth.ts
git commit -m "feat(server): configure better-auth with anonymous + bearer plugins"
```

---

### Task 3: Mount Auth Routes in Hono

**Files:**
- Create: `app-server/src/app.ts`
- Modify: `app-server/src/index.ts`

The app is split from `serve()` so tests can import `app` without starting a listener.

- [ ] **Step 1: Create `app-server/src/app.ts`**

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { HealthResponse } from "@opentab/shared";
import { auth } from "./auth.js";
import { env } from "./env.js";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (origin.startsWith("chrome-extension://")) return origin;
      if (env.TRUSTED_ORIGINS.includes(origin)) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    timestamp: Date.now(),
  };
  return c.json(body);
});
```

- [ ] **Step 2: Update `app-server/src/index.ts`**

Replace the entire file with:

```ts
import { serve } from "@hono/node-server";
import { app } from "./app.js";

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

- [ ] **Step 3: Commit**

```bash
git add app-server/src/app.ts app-server/src/index.ts
git commit -m "feat(server): mount CORS middleware and better-auth route handler"
```

---

### Task 4: Database Migration

- [ ] **Step 1: Run better-auth migration**

```bash
# From the repository root/app-server
pnpm db:migrate
```

Expected: Creates `app-server/data/auth.db` with `user`, `session`, and `account` tables. The CLI should confirm migration success.

If the CLI prompts for confirmation, answer `y`.

- [ ] **Step 2: Verify the database was created**

```bash
ls -la app-server/data/
```

Expected: `auth.db` file exists alongside `.gitkeep`.

- [ ] **Step 3: Verify tables exist**

```bash
sqlite3 app-server/data/auth.db ".tables"
```

Expected: Output includes `user`, `session`, `account` tables.

- [ ] **Step 4: Commit** (nothing to commit — db is gitignored, migration is run at dev setup time)

No commit needed. The `.env` and `data/*.db` are gitignored.

---

### Task 5: Server Integration Tests

**Files:**
- Create: `app-server/src/__tests__/auth.test.ts`
- Modify: `app-server/tsconfig.json`

- [ ] **Step 1: Update `app-server/tsconfig.json` to exclude tests from build**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false
  },
  "include": ["src"],
  "exclude": ["src/__tests__"]
}
```

- [ ] **Step 2: Write integration test for anonymous sign-in**

Create `app-server/src/__tests__/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { app } from "../app.js";

describe("anonymous auth", () => {
  it("POST /api/auth/sign-in/anonymous returns user and session", async () => {
    const res = await app.request("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeTypeOf("string");
    expect(body.session).toBeDefined();
    expect(body.session.token).toBeTypeOf("string");
  });

  it("GET /api/auth/get-session with Bearer token returns session", async () => {
    // First, create an anonymous account
    const signInRes = await app.request("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session } = await signInRes.json();

    // Then, verify the token works with Bearer auth
    const sessionRes = await app.request("/api/auth/get-session", {
      headers: { Authorization: `Bearer ${session.token}` },
    });

    expect(sessionRes.ok).toBe(true);

    const sessionBody = await sessionRes.json();
    expect(sessionBody.user).toBeDefined();
    expect(sessionBody.session).toBeDefined();
  });

  it("GET /api/auth/get-session without token returns 401", async () => {
    const res = await app.request("/api/auth/get-session");
    expect(res.ok).toBe(false);
  });
});
```

Note: Uses Hono's built-in `app.request()` test helper — no running server needed.

- [ ] **Step 3: Run the tests**

```bash
# From the repository root
pnpm --filter @opentab/server test
```

Expected: All 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add app-server/src/__tests__/auth.test.ts app-server/tsconfig.json
git commit -m "test(server): add integration tests for anonymous sign-in and bearer auth"
```

---

### Task 6: Shared Auth Types

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add `AuthState` type to `packages/shared/src/types.ts`**

Append after the existing `HealthResponse` interface:

```ts
export type AuthState =
  | {
      mode: "online";
      accountId: string;
      sessionToken: string;
      localUuid?: string;
    }
  | {
      mode: "offline";
      localUuid: string;
    };
```

- [ ] **Step 2: Export `AuthState` from `packages/shared/src/index.ts`**

Replace the file with:

```ts
export type { HealthResponse, AuthState } from "./types.js";
```

- [ ] **Step 3: Verify types compile**

```bash
# From the repository root
pnpm --filter @opentab/shared lint
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add AuthState union type for online/offline auth"
```

---

### Task 7: Extension Auth Storage Module

**Files:**
- Create: `app-extension/src/lib/auth-storage.ts`

- [ ] **Step 1: Create `app-extension/src/lib/auth-storage.ts`**

```ts
import type { AuthState } from "@opentab/shared";

const STORAGE_KEY = "opentab_auth";

export async function getAuthState(): Promise<AuthState | null> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as AuthState) ?? null;
}

export async function setAuthState(state: AuthState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}

export async function clearAuthState(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}
```

Note: `browser` is a global provided by WXT (polyfill of `chrome` API with promise support).

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/auth-storage.ts
git commit -m "feat(extension): add auth-storage module for chrome.storage.local"
```

---

### Task 8: Extension API Client

**Files:**
- Create: `app-extension/src/lib/api.ts`

- [ ] **Step 1: Create `app-extension/src/lib/api.ts`**

```ts
const API_BASE = "http://localhost:3001";

interface SignInAnonymousResponse {
  user: { id: string; isAnonymous: boolean };
  token: string;
}

export async function signInAnonymous(): Promise<SignInAnonymousResponse> {
  const res = await fetch(`${API_BASE}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Sign-in failed: ${res.status}`);
  }

  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/api.ts
git commit -m "feat(extension): add API client for anonymous sign-in and health check"
```

---

### Task 9: Extension Auth Manager

**Files:**
- Create: `app-extension/src/lib/auth-manager.ts`

- [ ] **Step 1: Create `app-extension/src/lib/auth-manager.ts`**

```ts
import { getAuthState, setAuthState } from "./auth-storage.js";
import { signInAnonymous } from "./api.js";

export async function initializeAuth(): Promise<void> {
  const existing = await getAuthState();
  if (existing?.mode === "online") {
    console.log("[auth] already authenticated, skipping init");
    return;
  }

  try {
    const { user, session } = await signInAnonymous();
    await setAuthState({
      mode: "online",
      accountId: user.id,
      sessionToken: session.token,
    });
    console.log("[auth] anonymous account created:", user.id);
  } catch (err) {
    const localUuid = crypto.randomUUID();
    await setAuthState({ mode: "offline", localUuid });
    console.warn("[auth] backend unreachable, using local UUID:", localUuid);
  }
}

export async function attemptRegistration(): Promise<void> {
  const state = await getAuthState();
  if (!state || state.mode === "online") {
    return;
  }

  try {
    const { user, session } = await signInAnonymous();
    await setAuthState({
      mode: "online",
      accountId: user.id,
      sessionToken: session.token,
      localUuid: state.localUuid,
    });
    console.log("[auth] offline → online, account:", user.id, "localUuid:", state.localUuid);
  } catch {
    // Still offline, will retry on next alarm
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/auth-manager.ts
git commit -m "feat(extension): add auth-manager with init and retry orchestration"
```

---

### Task 10: Update Background Service Worker

**Files:**
- Modify: `app-extension/src/entrypoints/background.ts`

- [ ] **Step 1: Replace `app-extension/src/entrypoints/background.ts`**

```ts
import { initializeAuth, attemptRegistration } from "@/lib/auth-manager";
import { getAuthState } from "@/lib/auth-storage";

const AUTH_RETRY_ALARM = "opentab-auth-retry";

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started");

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      console.log("[bg] first install detected, initializing auth");
      await initializeAuth();

      const state = await getAuthState();
      if (state?.mode === "offline") {
        await browser.alarms.create(AUTH_RETRY_ALARM, { periodInMinutes: 1 });
        console.log("[bg] offline mode — retry alarm created");
      }
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== AUTH_RETRY_ALARM) return;

    console.log("[bg] auth retry alarm fired");
    await attemptRegistration();

    const state = await getAuthState();
    if (state?.mode === "online") {
      await browser.alarms.clear(AUTH_RETRY_ALARM);
      console.log("[bg] now online — retry alarm cleared");
    }
  });
});
```

Note: `defineBackground` and `browser` are WXT globals — no import needed.

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/entrypoints/background.ts
git commit -m "feat(extension): wire auth init on install with offline retry via alarms"
```

---

### Task 11: Extension Manifest Permissions

**Files:**
- Modify: `app-extension/wxt.config.ts`

- [ ] **Step 1: Add `storage` and `alarms` permissions to `app-extension/wxt.config.ts`**

```ts
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["storage", "alarms"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  }),
});
```

- [ ] **Step 2: Verify extension type-checks**

```bash
# From the repository root
pnpm --filter @opentab/extension lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/wxt.config.ts
git commit -m "feat(extension): add storage and alarms permissions to manifest"
```

---

### Task 12: End-to-End Verification

- [ ] **Step 1: Full lint across all packages**

```bash
# From the repository root
pnpm lint
```

Expected: All packages pass type checking and biome.

- [ ] **Step 2: Start dev servers**

```bash
# From the repository root
pnpm dev
```

Expected: Server starts on port 3001, WXT dev server starts for the extension.

- [ ] **Step 3: Online flow — load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `app-extension/.output/chrome-mv3`
4. Open the service worker DevTools (click "service worker" link on the extension card)
5. Verify console shows:
   - `[bg] OpenTab background service worker started`
   - `[bg] first install detected, initializing auth`
   - `[auth] anonymous account created: <some-uuid>`

- [ ] **Step 4: Verify Chrome Storage has auth state**

In the extension's DevTools console, run:

```js
chrome.storage.local.get("opentab_auth", console.log)
```

Expected: `{ opentab_auth: { mode: "online", accountId: "...", sessionToken: "..." } }`

- [ ] **Step 5: Verify SQLite has the user**

```bash
sqlite3 app-server/data/auth.db "SELECT id, name, email FROM user;"
```

Expected: One row with an anonymous user.

- [ ] **Step 6: Offline flow — stop server and reinstall extension**

1. Stop the `pnpm dev` process (Ctrl+C)
2. In `chrome://extensions`, remove the OpenTab extension
3. Reload unpacked extension again
4. Check service worker console:
   - `[auth] backend unreachable, using local UUID: <uuid>`
   - `[bg] offline mode — retry alarm created`

- [ ] **Step 7: Recovery flow — restart server**

1. Start server only: `pnpm --filter @opentab/server dev`
2. Wait up to 60 seconds
3. Check service worker console for:
   - `[bg] auth retry alarm fired`
   - `[auth] offline → online, account: <id> localUuid: <uuid>`
   - `[bg] now online — retry alarm cleared`

- [ ] **Step 8: Verify storage transitioned to online with localUuid preserved**

```js
chrome.storage.local.get("opentab_auth", console.log)
```

Expected: `{ opentab_auth: { mode: "online", accountId: "...", sessionToken: "...", localUuid: "..." } }`
