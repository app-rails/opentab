# apps/cloud Deployment (Alchemy IaC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/cloud`'s hand-written `wrangler.jsonc` + `wrangler deploy` with Alchemy IaC. After this plan, `pnpm --filter @opentab/cloud dev` runs the local emulator and `alchemy deploy` (driven by GitHub Actions) provisions every Cloudflare resource declaratively.

**Architecture:** A single `apps/cloud/alchemy.run.ts` declares the Worker, D1 database, KV namespace, custom domain, and bindings for the active stage. Env validation lives in `packages/config/src/env/*` (zod schemas, four runtime entrypoints). Local dev uses `alchemy dev` (miniflare-backed emulator at `.alchemy/`). CI is split into `ci.yml` (PRs + main) and `deploy.yml` (manual dev deploys + tag-driven prod deploys).

**Tech Stack:** Alchemy (IaC), Cloudflare Workers + D1 + KV, React Router v7, BetterAuth, Drizzle ORM, zod, dotenv, vitest, pnpm + turbo, GitHub Actions, lefthook + commitlint.

**Spec reference:** `docs/superpowers/specs/2026-04-24-apps-cloud-deployment-alchemy-design.md`. When this plan and the spec disagree, the spec wins on intent and the plan wins on file/line specificity.

---

## Conventions

- **Commit per task.** Each task ends with a `git commit` step. Conventional Commits (`type(scope): subject`).
- **Frequent typecheck.** Run `pnpm --filter @opentab/cloud check-types` (or `pnpm check-types` at root) after any change touching imports / shapes.
- **Lefthook.** `pre-commit` runs Biome on staged files. `commit-msg` runs commitlint. Both are auto-installed via root `postinstall`. Do not bypass with `--no-verify`.
- **Workspace root.** All paths in this plan are relative to `/Users/liang.zhao/conductor/workspaces/opentab/baku/` (the monorepo root). Paths starting with `apps/` or `packages/` are repo-relative.
- **No real CF API calls until Group 9.** Tasks 1–22 all run locally without touching Cloudflare. Task 23 does the first real deploy.

## File Structure

| Path | Action | Owner |
|---|---|---|
| `packages/config/package.json` | Modify (add `type`, `exports`, deps, scripts) | Group 1 |
| `packages/config/tsconfig.json` | Create | Group 1 |
| `packages/config/vitest.config.ts` | Create | Group 1 |
| `packages/config/src/index.ts` | Create (placeholder for tsc inputs) | Group 1 |
| `packages/config/src/env/schemas.ts` | Create | Group 1 |
| `packages/config/src/env/schemas.test.ts` | Create | Group 1 |
| `packages/config/src/env/node.ts` | Create | Group 1 |
| `packages/config/src/env/worker.ts` | Create | Group 1 |
| `packages/config/src/env/browser.ts` | Create | Group 1 |
| `apps/cloud/package.json` | Modify (add `alchemy`, drop `wrangler`, rewrite scripts) | Group 2 + 4 |
| `apps/cloud/alchemy.run.ts` | Create | Group 2 |
| `apps/cloud/vite.config.ts` | Modify (gated alchemy plugin) | Group 2 |
| `apps/cloud/workers/app.ts` | Modify (parse env via `@opentab/config`) | Group 2 |
| `apps/cloud/drizzle.config.ts` | Modify (path → `.alchemy/miniflare/v3/`) | Group 3 |
| `apps/cloud/drizzle/seed/seed.ts` | Modify (re-import path source) | Group 3 |
| `apps/cloud/wrangler.jsonc` | Delete | Group 4 |
| `apps/cloud/wrangler.jsonc.example` | Delete | Group 4 |
| `apps/cloud/worker-configuration.d.ts` | Replace contents (hand shim mirroring alchemy.run.ts bindings) | Group 4 |
| `apps/cloud/.gitignore` | Modify (`.alchemy/`) | Group 4 |
| `.gitignore` (root) | Modify (`.alchemy/`) | Group 4 |
| `turbo.json` | Modify (drop wrangler input) | Group 4 |
| `package.json` (root) | Modify (drop `cloud:db:migrate:local`) | Group 4 |
| `apps/cloud/.env.example` | Rewrite | Group 5 |
| `apps/cloud/README.md` | Rewrite | Group 5 |
| `README.md` (root) | Modify (Phase 1 cross-link) | Group 5 |
| `.github/workflows/ci.yml` | Modify (split into lint / typecheck / test / build jobs) | Group 6 |
| `.github/workflows/deploy.yml` | Create | Group 6 |
| `docs/superpowers/specs/2026-04-24-apps-cloud-design.md` | Modify (append decision #33) | Group 7 |

---

# Group 1 — `packages/config` env validation foundation

`packages/config` is currently a placeholder (only `tsconfig.base.json`). This group turns it into a real published-shape package with zod env schemas and four runtime entrypoints. The env layer **must land first** because `apps/cloud/alchemy.run.ts` and the worker entrypoint both import from it.

### Task 1: Make `packages/config` a real package

**Files:**
- Modify: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/vitest.config.ts`
- Create: `packages/config/src/env/.keep` (placeholder so the directory exists for the next task)

**What and why:** Add the package manifest fields that turn the placeholder into something consumers can import from. The `exports` map preserves the existing `./tsconfig.base.json` consumer (broken otherwise once `exports` is added) and reserves the four env subpaths. Add `zod` and `dotenv` as deps; add `vitest` for the schema tests in Task 2.

- [ ] **Step 1: Replace `packages/config/package.json`**

```json
{
  "name": "@opentab/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./env/schemas": {
      "types": "./src/env/schemas.ts",
      "default": "./src/env/schemas.ts"
    },
    "./env/node": {
      "types": "./src/env/node.ts",
      "default": "./src/env/node.ts"
    },
    "./env/worker": {
      "types": "./src/env/worker.ts",
      "default": "./src/env/worker.ts"
    },
    "./env/browser": {
      "types": "./src/env/browser.ts",
      "default": "./src/env/browser.ts"
    }
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "lint": "biome check .",
    "test": "vitest run"
  },
  "dependencies": {
    "dotenv": "^17.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^4.1.1"
  }
}
```

If `dotenv@17` does not yet exist on npm at the time of execution, pin to the latest available major (≥16). Confirm before installing: `pnpm view dotenv versions --json | tail -5`.

- [ ] **Step 2: Create `packages/config/tsconfig.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/config/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create the env directory placeholder and a root index**

```bash
mkdir -p packages/config/src/env
touch packages/config/src/env/.keep
```

Create `packages/config/src/index.ts` with:

```ts
// Placeholder so `tsc --noEmit` finds at least one input file.
// Real exports live under ./env/* subpaths.
export {};
```

Without at least one `.ts` file in `src/`, `tsc --noEmit` errors with TS18003 ("No inputs were found in config file"). The `.keep` file does not satisfy this — TypeScript only counts `.ts`/`.tsx`. Matches the convention used by `packages/protocol/src/index.ts`.

- [ ] **Step 5: Install deps**

```bash
pnpm install
```

Expected: pnpm resolves `dotenv` and `zod` into `packages/config/node_modules/.pnpm/`. No errors. `pnpm-lock.yaml` updates.

- [ ] **Step 6: Verify the package is wired**

```bash
pnpm --filter @opentab/config check-types
```

Expected: exit 0.

```bash
pnpm --filter @opentab/cloud check-types
```

Expected: still passes (the existing `apps/cloud/tsconfig.json` consumes `@opentab/config/tsconfig.base.json` via the exports map; this confirms we did not break the existing consumer).

- [ ] **Step 7: Commit**

```bash
git add packages/config/
git commit -m "chore(config): scaffold env package with subpath exports"
```

---

### Task 2: Write zod env schemas (TDD)

**Files:**
- Create: `packages/config/src/env/schemas.test.ts`
- Create: `packages/config/src/env/schemas.ts`

**What and why:** Three layered zod schemas drive every env consumer. `BaseSchema` is the floor (every node script pays this). `WorkerEnvSchema` is what the Worker runtime actually sees from CF bindings. `AlchemyEnvSchema` extends both and adds the IaC-only fields plus cross-field guards. Test-first because zod schema bugs are silent (a wrong default leaks production secrets to dev or worse).

- [ ] **Step 1: Write the failing tests**

Create `packages/config/src/env/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AlchemyEnvSchema,
  BaseSchema,
  WorkerEnvSchema,
} from "./schemas";

describe("BaseSchema", () => {
  it("defaults NODE_ENV to development", () => {
    const out = BaseSchema.parse({});
    expect(out.NODE_ENV).toBe("development");
  });

  it("accepts NODE_ENV=production", () => {
    const out = BaseSchema.parse({ NODE_ENV: "production" });
    expect(out.NODE_ENV).toBe("production");
  });

  it("rejects unknown NODE_ENV values", () => {
    expect(() => BaseSchema.parse({ NODE_ENV: "staging" })).toThrow();
  });

  it("preserves CI as-is when set", () => {
    expect(BaseSchema.parse({ CI: "true" }).CI).toBe("true");
  });
});

const validWorkerEnv = {
  APP_URL: "https://opentab-dev.apprails.io",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_ADMIN_USER_ID: "user_abc",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
};

describe("WorkerEnvSchema", () => {
  it("accepts a complete valid env", () => {
    expect(() => WorkerEnvSchema.parse(validWorkerEnv)).not.toThrow();
  });

  it("rejects http:// APP_URL (must be https)", () => {
    expect(() =>
      WorkerEnvSchema.parse({ ...validWorkerEnv, APP_URL: "http://x.example" }),
    ).toThrow(/https/i);
  });

  it("rejects BETTER_AUTH_SECRET shorter than 32 chars", () => {
    expect(() =>
      WorkerEnvSchema.parse({ ...validWorkerEnv, BETTER_AUTH_SECRET: "short" }),
    ).toThrow(/32/);
  });

  it("rejects empty GITHUB_CLIENT_ID", () => {
    expect(() =>
      WorkerEnvSchema.parse({ ...validWorkerEnv, GITHUB_CLIENT_ID: "" }),
    ).toThrow();
  });
});

const validAlchemyEnv = {
  ...validWorkerEnv,
  ALCHEMY_STAGE: "dev",
  ALCHEMY_PASSWORD: "min8chars",
  ALCHEMY_STATE_TOKEN: "tok",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_API_TOKEN: "tok",
  CLOUDFLARE_ZONE_ID: "zone",
};

describe("AlchemyEnvSchema", () => {
  it("accepts a complete valid env for dev", () => {
    expect(() => AlchemyEnvSchema.parse(validAlchemyEnv)).not.toThrow();
  });

  it("accepts prod stage when CI=true and APP_URL matches", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        ALCHEMY_STAGE: "prod",
        APP_URL: "https://opentab.apprails.io",
        CI: "true",
      }),
    ).not.toThrow();
  });

  it("rejects prod stage when CI is unset", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        ALCHEMY_STAGE: "prod",
        APP_URL: "https://opentab.apprails.io",
      }),
    ).toThrow(/CI/);
  });

  it("rejects prod stage when APP_URL points to dev hostname", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        ALCHEMY_STAGE: "prod",
        APP_URL: "https://opentab-dev.apprails.io",
        CI: "true",
      }),
    ).toThrow(/APP_URL/);
  });

  it("rejects dev stage when APP_URL points to prod hostname", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        APP_URL: "https://opentab.apprails.io",
      }),
    ).toThrow(/APP_URL/);
  });

  it("rejects staging stage with a clear reserved-not-wired message", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        ALCHEMY_STAGE: "staging",
      }),
    ).toThrow(/staging is reserved/i);
  });

  it("rejects ALCHEMY_PASSWORD shorter than 8 chars", () => {
    expect(() =>
      AlchemyEnvSchema.parse({ ...validAlchemyEnv, ALCHEMY_PASSWORD: "short" }),
    ).toThrow(/8/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @opentab/config test
```

Expected: every test fails with "Cannot find module './schemas'" or similar.

- [ ] **Step 3: Implement `packages/config/src/env/schemas.ts`**

```ts
import { z } from "zod";

const STAGES = ["dev", "staging", "prod"] as const;

const PROD_HOSTNAME = "https://opentab.apprails.io";
const DEV_HOSTNAME = "https://opentab-dev.apprails.io";

export const BaseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  CI: z.string().optional(),
});

export type BaseEnv = z.infer<typeof BaseSchema>;

export const WorkerEnvSchema = z.object({
  APP_URL: z
    .url()
    .refine((s) => s.startsWith("https://"), {
      message: "APP_URL must use https://",
    }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be ≥32 chars (use `openssl rand -base64 32`)"),
  BETTER_AUTH_ADMIN_USER_ID: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export const AlchemyEnvSchema = BaseSchema.extend(WorkerEnvSchema.shape)
  .extend({
    ALCHEMY_STAGE: z.enum(STAGES),
    ALCHEMY_PASSWORD: z
      .string()
      .min(8, "ALCHEMY_PASSWORD encrypts state secrets; use ≥8 chars"),
    ALCHEMY_STATE_TOKEN: z.string().min(1),
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
    CLOUDFLARE_API_TOKEN: z.string().min(1),
    CLOUDFLARE_ZONE_ID: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.ALCHEMY_STAGE === "staging") {
      ctx.addIssue({
        code: "custom",
        path: ["ALCHEMY_STAGE"],
        message:
          "staging is reserved but not wired yet — use dev or prod, or add a hostname mapping in alchemy.run.ts first",
      });
      return;
    }
    if (v.ALCHEMY_STAGE === "prod") {
      if (v.CI !== "true") {
        ctx.addIssue({
          code: "custom",
          path: ["CI"],
          message: "CI=true is required when ALCHEMY_STAGE=prod",
        });
      }
      if (v.APP_URL !== PROD_HOSTNAME) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: `APP_URL must be ${PROD_HOSTNAME} when ALCHEMY_STAGE=prod`,
        });
      }
    }
    if (v.ALCHEMY_STAGE === "dev" && v.APP_URL !== DEV_HOSTNAME) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: `APP_URL must be ${DEV_HOSTNAME} when ALCHEMY_STAGE=dev`,
      });
    }
  });

export type AlchemyEnv = z.infer<typeof AlchemyEnvSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @opentab/config test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/env/schemas.ts packages/config/src/env/schemas.test.ts
git rm packages/config/src/env/.keep
git commit -m "feat(config): add zod env schemas (Base, Worker, Alchemy)"
```

---

### Task 3: Write the Node entrypoint

**Files:**
- Create: `packages/config/src/env/node.ts`

**What and why:** `node.ts` is the only entrypoint that pulls `dotenv` (Node-only). Two functions: `env` is the eagerly-parsed minimal floor (cheap; every script pays it). `getAlchemyEnv()` is lazy — only `alchemy.run.ts` calls it, so the heavier `AlchemyEnvSchema.parse` runs only when needed.

- [ ] **Step 1: Create `packages/config/src/env/node.ts`**

```ts
import "dotenv/config";
import { AlchemyEnvSchema, BaseSchema } from "./schemas";

export const env = BaseSchema.parse(process.env);

export function getAlchemyEnv() {
  return AlchemyEnvSchema.parse(process.env);
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter @opentab/config check-types
```

Expected: exit 0.

- [ ] **Step 3: Verify it runs (smoke)**

```bash
node --experimental-strip-types -e "import('@opentab/config/env/node').then(m => console.log(m.env))" --input-type=module
```

(If your local Node lacks `--experimental-strip-types`, use `pnpm exec tsx -e "..."` instead.)

Expected: prints `{ NODE_ENV: 'development', CI: undefined }` (or whatever is in the current shell env). If it throws, the env package is misconfigured.

- [ ] **Step 4: Commit**

```bash
git add packages/config/src/env/node.ts
git commit -m "feat(config): add node env entrypoint with dotenv loading"
```

---

### Task 4: Write the Worker entrypoint

**Files:**
- Create: `packages/config/src/env/worker.ts`

**What and why:** `worker.ts` is what the Worker runtime calls to validate `context.cloudflare.env` before using it. No `dotenv`, no `process.env` — the Worker bundle stays clean.

- [ ] **Step 1: Create `packages/config/src/env/worker.ts`**

```ts
import { WorkerEnvSchema, type WorkerEnv } from "./schemas";

export type { WorkerEnv };

export function parseWorkerEnv(ctxEnv: unknown): WorkerEnv {
  return WorkerEnvSchema.parse(ctxEnv);
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter @opentab/config check-types
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/config/src/env/worker.ts
git commit -m "feat(config): add worker env entrypoint"
```

---

### Task 5: Write the browser placeholder

**Files:**
- Create: `packages/config/src/env/browser.ts`

**What and why:** Reserved for future `VITE_*` consumers. Empty export so future code adding a real `parseBrowserEnv` does not break import paths that already exist in app code (none today, but the spec promises this entrypoint).

- [ ] **Step 1: Create `packages/config/src/env/browser.ts`**

```ts
// Placeholder. Populate when the first browser-bundled VITE_* var is added.
export {};
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter @opentab/config check-types
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/config/src/env/browser.ts
git commit -m "feat(config): add browser env placeholder entrypoint"
```

---

# Group 2 — `apps/cloud` Alchemy infrastructure

This group adds Alchemy as a dependency, writes `alchemy.run.ts` (defining D1 + KV + Worker + custom domain), gates the new Vite plugin, and rewires the Worker entrypoint to validate env via `@opentab/config`. After Group 2 the project still has both `wrangler.jsonc` and `alchemy.run.ts` co-existing — Group 4 deletes wrangler.

### Task 6: Add Alchemy dependency to `apps/cloud`

**Files:**
- Modify: `apps/cloud/package.json`

**What and why:** Pull in `alchemy` and the workspace `@opentab/config` package so the next task's `alchemy.run.ts` can import them. Do not remove `wrangler` yet — that happens in Task 13 once nothing references it.

- [ ] **Step 1: Verify the latest stable Alchemy version**

```bash
pnpm view alchemy version
```

Expected: prints something like `0.91.x` or higher. Use this version below.

- [ ] **Step 2: Install Alchemy and `@opentab/config` in `apps/cloud`**

```bash
pnpm --filter @opentab/cloud add alchemy@latest
pnpm --filter @opentab/cloud add @opentab/config@workspace:*
```

Expected: `apps/cloud/package.json` gains `"alchemy"` and `"@opentab/config": "workspace:*"` in `dependencies`. `pnpm-lock.yaml` updates. (`dotenv` is not added to apps/cloud — it is a transitive dep of `@opentab/config` and used only inside `env/node.ts`.)

- [ ] **Step 3: Verify install**

```bash
pnpm --filter @opentab/cloud exec node -e "import('alchemy').then(m => console.log(typeof m.default))" --input-type=module
```

Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add apps/cloud/package.json pnpm-lock.yaml
git commit -m "chore(cloud): add alchemy + @opentab/config dependencies"
```

---

### Task 7: Write `apps/cloud/alchemy.run.ts`

**Files:**
- Create: `apps/cloud/alchemy.run.ts`

**What and why:** The single source of truth for every CF resource. Resources defined: D1 (with auto-applied migrations), KV, the RR7 worker (with bindings), and the per-stage custom domain. Stage-aware hostname picker hardcoded — only `dev` and `prod` are reachable here; `staging` is rejected by `AlchemyEnvSchema` upstream.

- [ ] **Step 1: Create `apps/cloud/alchemy.run.ts`**

```ts
import alchemy from "alchemy";
import {
  CustomDomain,
  D1Database,
  KVNamespace,
  ReactRouter,
} from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { getAlchemyEnv } from "@opentab/config/env/node";

// All env validation happens in @opentab/config — fail-fast on missing /
// malformed values before any CF resource is touched. AlchemyEnvSchema also
// enforces:
//   - prod requires CI=true
//   - APP_URL must match the per-stage hostname
//   - staging is rejected (reserved, no hostname mapped yet)
const env = getAlchemyEnv();

// Defense in depth: AlchemyEnvSchema's superRefine already enforces this,
// but the runtime guard here is the load-bearing one — schema rules can be
// loosened later by accident; this throw cannot.
if (env.ALCHEMY_STAGE === "prod" && env.CI !== "true") {
  throw new Error(
    "ALCHEMY_STAGE=prod is only allowed in CI. Use ALCHEMY_STAGE=dev locally; " +
      "tag v*.*.* to ship prod via Actions.",
  );
}

const appName = "opentab-cloud";
const app = await alchemy(appName, {
  stage: env.ALCHEMY_STAGE,
  // CloudflareStateStore: state lives on the CF account — no operator-managed
  // R2 bucket needed. ALCHEMY_STATE_TOKEN must NEVER rotate after first deploy
  // (loss requires forceUpdate: true recovery). See spec §10.
  stateStore: (scope) => new CloudflareStateStore(scope),
  // ALCHEMY_PASSWORD encrypts secrets at rest in the state store. NEVER
  // change after first deploy — would orphan all stored secrets.
  password: env.ALCHEMY_PASSWORD,
});

const prefix = `${appName}-${env.ALCHEMY_STAGE}`;
const hostname =
  env.ALCHEMY_STAGE === "prod"
    ? "opentab.apprails.io"
    : "opentab-dev.apprails.io";

const db = await D1Database("db", {
  name: `${prefix}-db`,
  // Alchemy auto-applies any migrations not yet recorded in d1_migrations.
  // Local emulator (alchemy dev) and remote (alchemy deploy) use the same
  // tracking table, so migrations are never double-applied.
  migrationsDir: "./drizzle/migrations",
  migrationsTable: "d1_migrations",
});

const kv = await KVNamespace("kv", {
  title: `${prefix}-kv`,
});

export const worker = await ReactRouter("worker", {
  name: `${prefix}-worker`,
  bindings: {
    DB: db,
    APP_KV: kv,
    APP_URL: env.APP_URL,
    BETTER_AUTH_SECRET: alchemy.secret.env("BETTER_AUTH_SECRET"),
    BETTER_AUTH_ADMIN_USER_ID: env.BETTER_AUTH_ADMIN_USER_ID,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: alchemy.secret.env("GITHUB_CLIENT_SECRET"),
  },
});

// CustomDomain takes `workerName: string` (not the worker resource object).
// Pass the worker's `name` so Alchemy binds the domain to the freshly
// created/updated worker. Verified via alchemy/cloudflare/custom-domain.d.ts
// in alchemy@^0.91.
await CustomDomain("custom-domain", {
  name: hostname,
  workerName: worker.name,
  zoneId: env.CLOUDFLARE_ZONE_ID,
});

console.log({ url: `https://${hostname}` });

await app.finalize();
```

- [ ] **Step 2: Verify it typechecks (no execution — that needs CF creds)**

Add `alchemy.run.ts` to the cloud tsconfig include list:

```bash
# Inspect; if alchemy.run.ts is not in include[], add it
cat apps/cloud/tsconfig.json
```

If `"alchemy.run.ts"` is missing from `include`, add it (the existing array already lists `vite.config.ts`, `drizzle.config.ts`, etc.):

Edit `apps/cloud/tsconfig.json` `include` array to append `"alchemy.run.ts"`:

```json
  "include": [
    "app/**/*",
    "drizzle/**/*",
    "workers/**/*",
    "react-router.config.ts",
    "vite.config.ts",
    "drizzle.config.ts",
    "alchemy.run.ts",
    "worker-configuration.d.ts",
    ".react-router/types/**/*"
  ]
```

Then:

```bash
pnpm --filter @opentab/cloud check-types
```

Expected: exit 0.

Sanity-check the import surface (Alchemy's exports may have shifted between releases):

```bash
pnpm --filter @opentab/cloud exec node -e "import('alchemy/cloudflare').then(m => console.log(Object.keys(m).filter(k => /CustomDomain|D1Database|KVNamespace|ReactRouter/.test(k))))" --input-type=module
```

Expected: array includes `CustomDomain`, `D1Database`, `KVNamespace`, `ReactRouter`. If `CustomDomain` is missing on the installed version, check the d.ts under `node_modules/alchemy/lib/cloudflare/` for the right name and adjust the import.

- [ ] **Step 3: Commit**

```bash
git add apps/cloud/alchemy.run.ts apps/cloud/tsconfig.json
git commit -m "feat(cloud): add alchemy.run.ts with D1 + KV + worker + custom domain"
```

---

### Task 8: Update `apps/cloud/vite.config.ts` (gated Alchemy plugin)

**Files:**
- Modify: `apps/cloud/vite.config.ts`

**What and why:** Replace the user-written `cloudflare()` plugin call with the gated `alchemyPlugin()`. Gate it on `existsSync(.alchemy/local/wrangler.jsonc)` so a fresh clone running `pnpm build` (CI before any deploy) still produces a worker bundle. When the plugin is absent, register `cloudflare:*` specifiers as SSR builtins so Vite externalizes them.

**Do not remove `@cloudflare/vite-plugin` from devDependencies.** While pnpm marks it optional in alchemy's `peerDependenciesMeta`, `alchemy/cloudflare/react-router/plugin.js` imports it at module load time. Removing the dep would not trigger a pnpm warning, but the very first `import alchemyPlugin from "alchemy/cloudflare/react-router"` in `vite.config.ts` would crash with `Cannot find module '@cloudflare/vite-plugin'`. Keep it installed; just stop calling it directly from our `vite.config.ts`.

- [ ] **Step 1: Replace `apps/cloud/vite.config.ts`**

```ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import alchemyPlugin from "alchemy/cloudflare/react-router";
import { defineConfig, type PluginOption } from "vite";
import devtoolsJson from "vite-plugin-devtools-json";
import tsconfigPaths from "vite-tsconfig-paths";

// `alchemyPlugin()` reads .alchemy/local/wrangler.jsonc, generated by
// `alchemy dev` / `alchemy deploy`. A fresh clone running `pnpm build`
// (CI before any deploy) would crash without it. Gate the plugin so
// CI-only build still works; Alchemy itself owns deploys via `pnpm deploy`.
//
// Two-step gate: file must exist AND alchemyPlugin() must return a non-null
// value. The plugin returns null during react-router typegen runs.
const wranglerPath = resolve(__dirname, ".alchemy/local/wrangler.jsonc");
const maybePlugin = existsSync(wranglerPath) ? alchemyPlugin() : null;
const alchemyPlugins: PluginOption[] = maybePlugin ? [maybePlugin as PluginOption] : [];

export default defineConfig({
  plugins: [
    ...alchemyPlugins,
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    devtoolsJson(),
  ],
  server: {
    open: true,
  },
  build: {
    minify: true,
  },
  // When the Alchemy plugin is absent (fresh clone, `pnpm build` in CI),
  // `cloudflare:*` specifiers have no native resolver. Register them as
  // SSR builtins so Vite externalizes them; the CF Workers runtime resolves
  // them at deploy time. The Alchemy plugin does the same internally when
  // present.
  ...(alchemyPlugins.length === 0 && {
    environments: {
      ssr: {
        resolve: {
          builtins: [
            "cloudflare:workers",
            "cloudflare:email",
            "cloudflare:node",
            "cloudflare:sockets",
            "cloudflare:workflows",
          ],
        },
      },
    },
  }),
});
```

- [ ] **Step 2: Verify the build still works without `.alchemy/local/`**

```bash
test ! -d apps/cloud/.alchemy && echo "alchemy local dir absent (good)"
pnpm --filter @opentab/cloud build
```

Expected: build succeeds. The output `build/server/` exists. The fallback SSR builtins branch is exercised. No `cloudflare:workers` resolution errors.

If the build fails because `worker-configuration.d.ts` is missing or stale, leave that for Task 13 (it replaces the file with a hand shim).

- [ ] **Step 3: Commit**

```bash
git add apps/cloud/vite.config.ts
git commit -m "feat(cloud): swap cloudflare() plugin for gated alchemyPlugin()"
```

---

### Task 9: Update `apps/cloud/workers/app.ts` to validate env

**Files:**
- Modify: `apps/cloud/workers/app.ts`

**What and why:** Validate `env` exactly once per worker isolate (not per request) using `parseWorkerEnv` from `@opentab/config/env/worker`. Module-scope memo: the first request inside a fresh isolate triggers the parse; every subsequent request hits the cached `WorkerEnv`. If parse throws, every request in this isolate 500s — that is the correct loud failure for misconfigured bindings.

The `Env` interface is still provided by `worker-configuration.d.ts` at this point in the plan — Task 13 replaces it with a hand-maintained shim.

- [ ] **Step 1: Replace `apps/cloud/workers/app.ts`**

```ts
import { parseWorkerEnv, type WorkerEnv } from "@opentab/config/env/worker";
import { createRequestHandler, RouterContextProvider } from "react-router";

declare module "react-router" {
  export interface RouterContextProvider {
    cloudflare: {
      env: WorkerEnv & Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// Cache the parse result per worker isolate. The CF Workers runtime keeps
// `env` referentially stable for the lifetime of the isolate, so a single
// parse covers every subsequent request.
let parsedEnvCheckedFor: unknown = null;
const ensureWorkerEnv = (env: unknown): void => {
  if (parsedEnvCheckedFor !== env) {
    parseWorkerEnv(env);
    parsedEnvCheckedFor = env;
  }
};

export default {
  async fetch(request, env, ctx) {
    ensureWorkerEnv(env);

    const context = new RouterContextProvider();
    return await requestHandler(
      request,
      Object.assign(context, {
        cloudflare: { env, ctx },
      }),
    );
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 2: Verify typecheck and build**

```bash
pnpm --filter @opentab/cloud check-types
pnpm --filter @opentab/cloud build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/cloud/workers/app.ts
git commit -m "feat(cloud): validate worker env via @opentab/config"
```

---

# Group 3 — Local dev path migration

`drizzle.config.ts` and `drizzle/seed/seed.ts` currently point at the wrangler-managed local D1 path (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject`). With `alchemy dev`, the path moves to the workspace root: `<repo-root>/.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`. This group rewires both consumers.

### Task 10: Update `drizzle.config.ts` to point at the new local D1 path

**Files:**
- Modify: `apps/cloud/drizzle.config.ts`

**What and why:** Alchemy's miniflare controller writes the local D1 file to `<workspaceRoot>/.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite` (verified against `node_modules/alchemy/lib/cloudflare/miniflare/paths.js` — `getDefaultPersistPath` returns `path.join(workspaceRoot, ".alchemy", "miniflare", "v3")`). The drizzle config helper needs to walk from `apps/cloud/` up to the repo root.

- [ ] **Step 1: Replace `apps/cloud/drizzle.config.ts`**

```ts
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "drizzle-kit";

// alchemy dev's miniflare persists at <workspaceRoot>/.alchemy/miniflare/v3/.
// `workspaceRoot` is computed by Alchemy via `findWorkspaceRootSync`, which
// returns the pnpm-workspace.yaml directory. In this monorepo that is two
// levels above apps/cloud/. The hardcoded `../../` walk holds as long as
// the project stays at apps/cloud/ and pnpm-workspace.yaml stays at the
// repo root — both invariants of this monorepo.
const D1_DIR = resolve(
  __dirname,
  "../../.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject",
);

const getD1Url = (): string => {
  if (!existsSync(D1_DIR)) return "";

  const sqliteFile = readdirSync(D1_DIR).find((f) => f.endsWith(".sqlite"));
  return sqliteFile ? `${D1_DIR}/${sqliteFile}` : "";
};

export const d1Url = getD1Url();

export default {
  schema: "./drizzle/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: d1Url,
  },
} satisfies Config;
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter @opentab/cloud check-types
```

Expected: exit 0.

- [ ] **Step 3: Confirm `db:generate` still loads the config**

```bash
pnpm --filter @opentab/cloud db:generate -- --help 2>&1 | head -20
```

Expected: drizzle-kit prints help text without throwing config errors. (It is OK that `d1Url` is empty string at this point — no `.alchemy/` yet.)

- [ ] **Step 4: Commit**

```bash
git add apps/cloud/drizzle.config.ts
git commit -m "chore(cloud): point drizzle.config at .alchemy/miniflare/v3 local path"
```

---

### Task 11: Update `drizzle/seed/seed.ts` to use the new path

**Files:**
- Modify: `apps/cloud/drizzle/seed/seed.ts`

**What and why:** `seed.ts` already imports `d1Url` from `drizzle.config.ts`, so the path change in Task 10 propagates automatically. The only remaining edit is a clearer error when the local DB does not exist (i.e., the developer never ran `alchemy dev`). The current code constructs `file:` with empty string and produces a confusing libsql error.

- [ ] **Step 1: Add a fail-fast at the top of `apps/cloud/drizzle/seed/seed.ts`**

Locate the existing line:

```ts
const db = drizzle(`file:${d1Url}`);
```

Add the guard immediately above:

```ts
if (!d1Url) {
  console.error(
    "❌ Local D1 file not found at .alchemy/miniflare/v3/d1/. Run `pnpm --filter @opentab/cloud dev` once first to materialize the local emulator.",
  );
  process.exit(1);
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @opentab/cloud check-types
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/cloud/drizzle/seed/seed.ts
git commit -m "chore(cloud): add fail-fast guard when local D1 is missing"
```

---

# Group 4 — Wrangler removal & infra cleanup

Remove the now-redundant wrangler artifacts and tighten gitignores. The order matters: scripts and turbo references must drop wrangler **before** the file is deleted, otherwise builds break mid-task.

### Task 12: Replace `apps/cloud/package.json` scripts and devDependencies

**Files:**
- Modify: `apps/cloud/package.json`

**What and why:** Drop wrangler-driven scripts (`cf-typegen`, `typegen`, `db:migrate:local`, `db:migrate:remote`, `db:drop`, `preview`) and the `wrangler` devDependency. Update `dev` and `deploy` to invoke Alchemy. Add `destroy`. Keep `auth:secret`, `auth:generate`, `db:generate`, `db:studio`, `db:seed:local`, `lint`, `test`, `check-types` unchanged in name/purpose.

- [ ] **Step 1: Replace the `scripts` block in `apps/cloud/package.json`**

Replace the entire `"scripts": { ... }` object with:

```json
  "scripts": {
    "dev": "alchemy dev",
    "build": "react-router build",
    "deploy": "alchemy deploy",
    "destroy": "alchemy destroy",
    "check-types": "react-router typegen && tsc -b",
    "lint": "biome check .",
    "test": "vitest run",
    "auth:secret": "pnpm dlx @better-auth/cli@latest secret",
    "auth:generate": "pnpm dlx @better-auth/cli@latest generate --config=./app/services/auth/auth.server.ts --output=./drizzle/schema/auth.ts",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio",
    "db:seed:local": "tsx ./drizzle/seed/seed.ts"
  },
```

Removed (compared to the previous version):
- `cf-typegen` — Alchemy's typegen replaces wrangler types.
- `typegen` — same.
- `postinstall` — was `npm run cf-typegen`; no longer needed.
- `preview` — `wrangler dev`'s preview mode; not used in the new flow.
- `db:migrate:local`, `db:migrate:remote`, `db:drop` — Alchemy applies migrations automatically.

**Keep `wrangler` in `devDependencies`.** Alchemy declares it as a non-optional `peerDependencies` entry; removing it triggers a pnpm "missing peer" warning and may break Alchemy code paths that shell out to wrangler internally. The plan's intent — "no human runs `wrangler` directly" — is satisfied by removing the scripts above; the dependency itself stays.

- [ ] **Step 2: Verify scripts still resolve and typecheck passes**

```bash
pnpm --filter @opentab/cloud check-types
```

Expected: exit 0. (`react-router typegen` writes to `.react-router/types/`; that path is already in `tsconfig.json`'s `rootDirs`.)

- [ ] **Step 3: Commit**

```bash
git add apps/cloud/package.json
git commit -m "chore(cloud): rewrite scripts for alchemy; keep wrangler peer dep"
```

---

### Task 13: Delete wrangler config files; replace `worker-configuration.d.ts` with a hand-maintained shim

**Files:**
- Delete: `apps/cloud/wrangler.jsonc`
- Delete: `apps/cloud/wrangler.jsonc.example`
- Replace: `apps/cloud/worker-configuration.d.ts` (contents — keep filename so existing tsconfig include + Cloudflare runtime ambient types reference still resolve)

**What and why:** `wrangler.jsonc` and its example have no consumers after Task 12. `worker-configuration.d.ts` was previously generated by `wrangler types` and contained both the `Env` interface and Cloudflare runtime ambient types. We replace the contents with a small hand-written shim: a minimal `Env` interface matching the bindings declared in `alchemy.run.ts`, plus a triple-slash reference to `@cloudflare/workers-types` for the runtime ambient types (`D1Database`, `KVNamespace`, `ExecutionContext`, `ExportedHandler`, etc.). Alchemy can regenerate this later from `alchemy.run.ts`; the hand shim is the explicit, predictable starting point.

- [ ] **Step 1: Confirm nothing in source code references the wrangler config files**

```bash
grep -rn 'wrangler.jsonc' apps/cloud --include='*.ts' --include='*.tsx' --include='*.json' --include='*.jsonc' 2>/dev/null
```

Expected: no matches in active source.

- [ ] **Step 2: Remove `worker-configuration.d.ts` from gitignores**

The file is currently gitignored (root `.gitignore` line `worker-configuration.d.ts` and `apps/cloud/.gitignore` line `worker-configuration.d.ts`). Without this step, `git add apps/cloud/worker-configuration.d.ts` later in this task silently skips the new shim and the next `pnpm install` on a fresh clone would have no `Env` interface.

Edit `.gitignore` (root) — remove the line `worker-configuration.d.ts` (under the `# Cloudflare` section).

Edit `apps/cloud/.gitignore` — remove the line `worker-configuration.d.ts`.

Verify:

```bash
git check-ignore -v apps/cloud/worker-configuration.d.ts 2>/dev/null && echo "STILL IGNORED — re-check edits" || echo "tracked (good)"
```

Expected: prints `tracked (good)`.

- [ ] **Step 3: Delete the wrangler config files**

```bash
git rm apps/cloud/wrangler.jsonc apps/cloud/wrangler.jsonc.example
```

- [ ] **Step 4: Replace `apps/cloud/worker-configuration.d.ts` with the hand shim**

```ts
/// <reference types="@cloudflare/workers-types" />

// Hand-maintained mirror of the bindings declared in alchemy.run.ts.
// Keep in sync until Alchemy emits a generated equivalent.
interface Env {
  DB: D1Database;
  APP_KV: KVNamespace;
  APP_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_ADMIN_USER_ID: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}
```

- [ ] **Step 5: Ensure `@cloudflare/workers-types` is installed**

```bash
pnpm --filter @opentab/cloud list @cloudflare/workers-types 2>/dev/null
```

If absent (likely — wrangler bundled the types previously), install:

```bash
pnpm --filter @opentab/cloud add -D @cloudflare/workers-types
```

- [ ] **Step 6: Verify typecheck and build still pass**

```bash
pnpm --filter @opentab/cloud check-types
pnpm --filter @opentab/cloud build
```

Expected: both pass. If a binding referenced in app code (`DB`, `APP_KV`, etc.) does not exist on `Env`, add it to the shim — symptom is "Property 'X' does not exist on type 'Env'".

- [ ] **Step 7: Commit**

```bash
git add .gitignore apps/cloud/.gitignore apps/cloud/worker-configuration.d.ts apps/cloud/package.json pnpm-lock.yaml
git commit -m "chore(cloud): delete wrangler.jsonc; replace worker types with shim"
```

---

### Task 14: Update gitignore to cover `.alchemy/`

**Files:**
- Modify: `.gitignore` (root)
- Modify: `apps/cloud/.gitignore`

**What and why:** Alchemy writes two artifacts: `apps/cloud/.alchemy/local/wrangler.jsonc` (project-level) and `<repoRoot>/.alchemy/miniflare/v3/...` (workspace-level). A single gitignore entry `.alchemy/` (no leading slash) at root covers both because git matches `.alchemy/` anywhere in the tree. Add it to `apps/cloud/.gitignore` too as defense in depth.

- [ ] **Step 1: Append `.alchemy/` to the root `.gitignore`**

Add to `.gitignore` near the existing Cloudflare section:

```
# Alchemy
.alchemy/
```

(Place after the existing `# Cloudflare` block at lines containing `.mf .wrangler`.)

- [ ] **Step 2: Append `.alchemy/` to `apps/cloud/.gitignore`**

Add at the bottom:

```
# Alchemy
.alchemy/
```

- [ ] **Step 3: Verify the pattern works (no false positives with current tree)**

```bash
git check-ignore -v apps/cloud/.alchemy/local/wrangler.jsonc 2>/dev/null && echo "ignored" || echo "NOT ignored"
git check-ignore -v .alchemy/miniflare/v3/anything 2>/dev/null && echo "ignored" || echo "NOT ignored"
```

Expected: both print `ignored`.

- [ ] **Step 4: Commit**

```bash
git add .gitignore apps/cloud/.gitignore
git commit -m "chore: gitignore .alchemy/ at root and apps/cloud"
```

---

### Task 15: Drop `wrangler.jsonc` from `turbo.json` and the root `cloud:db:migrate:local` script

**Files:**
- Modify: `turbo.json`
- Modify: `package.json` (root)

**What and why:** `turbo.json` lists `wrangler.jsonc` as an input for `@opentab/cloud#build` — invalid now that the file is gone. The root `package.json` exposes `cloud:db:migrate:local` which calls a now-deleted script.

- [ ] **Step 1: Update `turbo.json`**

Find the block:

```json
    "@opentab/cloud#build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*", "wrangler.jsonc"],
      "outputs": ["build/**", ".react-router/**", "dist/**"]
    },
```

Replace `"wrangler.jsonc"` with `"alchemy.run.ts"`:

```json
    "@opentab/cloud#build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*", "alchemy.run.ts"],
      "outputs": ["build/**", ".react-router/**", "dist/**"]
    },
```

- [ ] **Step 2: Update root `package.json` scripts**

Remove the line `"cloud:db:migrate:local": "pnpm --filter @opentab/cloud db:migrate:local",` from the `scripts` block. The surrounding context after the edit:

```json
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "check-types": "turbo check-types",
    "lint": "turbo lint",
    "format": "biome format --write .",
    "check": "biome check .",
    "postinstall": "lefthook install",
    "ext:dev": "pnpm --filter @opentab/extension dev",
    "cloud:dev": "pnpm --filter @opentab/cloud dev",
    "cloud:build": "pnpm --filter @opentab/cloud build",
    "cloud:deploy": "pnpm --filter @opentab/cloud deploy",
    "cloud:db:generate": "pnpm --filter @opentab/cloud db:generate",
    "cloud:db:seed:local": "pnpm --filter @opentab/cloud db:seed:local"
  },
```

Note the trailing comma on `cloud:db:generate` (the line is now followed by another script), and no trailing comma on `cloud:db:seed:local` (last entry).

- [ ] **Step 3: Verify**

```bash
pnpm check-types
```

Expected: exit 0 across the workspace.

- [ ] **Step 4: Commit**

```bash
git add turbo.json package.json
git commit -m "chore: drop wrangler.jsonc input and cloud:db:migrate:local script"
```

---

# Group 5 — DX artifacts

Replace the React-Router-scaffold-flavored `.env.example` and `README.md` with opentab-specific versions. Update the root README to reflect Phase 1 in progress and link both specs.

### Task 16: Rewrite `apps/cloud/.env.example`

**Files:**
- Modify: `apps/cloud/.env.example`

**What and why:** Match the env layer in Tasks 2–4 exactly. Every variable carries an inline comment explaining what it is, how to obtain it, and notable constraints. New developers should be able to fill `.env` from this file alone.

- [ ] **Step 1: Replace `apps/cloud/.env.example`**

```bash
# ============================================================================
# Alchemy infrastructure
# ============================================================================
# Target stage. Local dev uses `dev`. CI sets this per workflow.
# Allowed: dev | staging | prod
# Note: `staging` is reserved but not yet wired — will throw at parse time.
ALCHEMY_STAGE=dev

# Encrypts secrets at rest in Alchemy state.
# Generate: `openssl rand -base64 32`
# IMPORTANT: never change after first deploy — would orphan stored secrets.
ALCHEMY_PASSWORD=

# CloudflareStateStore access token.
# Generate via CF dashboard → My Profile → API Tokens → "Edit Cloudflare Workers".
# IMPORTANT: never rotate after first deploy — loss requires forceUpdate recovery.
ALCHEMY_STATE_TOKEN=

# Set to "true" only inside CI. Required when ALCHEMY_STAGE=prod.
# CI=true

# ============================================================================
# Cloudflare account
# ============================================================================
# CF dashboard → Workers & Pages → "Account ID" in the right sidebar.
CLOUDFLARE_ACCOUNT_ID=

# CF dashboard → My Profile → API Tokens → "Create Token". Required scopes:
#   Account.Workers Scripts:Edit, Account.D1:Edit,
#   Account.Workers KV Storage:Edit, Account.Workers Routes:Edit,
#   Zone.DNS:Edit (limited to apprails.io).
CLOUDFLARE_API_TOKEN=

# CF dashboard → apprails.io zone → Overview → Zone ID.
CLOUDFLARE_ZONE_ID=

# ============================================================================
# Application config (per stage; values below are dev defaults)
# ============================================================================
# Public URL of this stage. Must match the Custom Domain in alchemy.run.ts.
# AlchemyEnvSchema enforces this at parse time.
APP_URL=https://opentab-dev.apprails.io

# BetterAuth signing secret.
# Generate: `pnpm --filter @opentab/cloud auth:secret`
# Must be ≥32 chars.
BETTER_AUTH_SECRET=

# BetterAuth admin plugin: user ID granted admin access.
BETTER_AUTH_ADMIN_USER_ID=

# ============================================================================
# GitHub OAuth (one app per stage; below are for the dev OAuth app)
# ============================================================================
# https://github.com/settings/developers → New OAuth App
# Authorization callback URL must equal: ${APP_URL}/api/auth/callback/github
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add apps/cloud/.env.example
git commit -m "docs(cloud): rewrite .env.example for Alchemy + per-stage OAuth"
```

---

### Task 17: Rewrite `apps/cloud/README.md`

**Files:**
- Modify: `apps/cloud/README.md`

**What and why:** The current README is the foxlau scaffold's README and references Google OAuth, todos, wrangler — none of which apply. Replace with an opentab-specific operator manual that mirrors §8.2 of the spec.

- [ ] **Step 1: Replace `apps/cloud/README.md`**

```markdown
# @opentab/cloud

Full-stack server for OpenTab: BetterAuth-based Web UI + sync API for the
Chrome extension. Deployed on Cloudflare Workers (D1 + KV) via Alchemy IaC.

## Architecture

- React Router v7 (SSR) on Cloudflare Workers
- BetterAuth (email/password + GitHub OAuth + admin plugin)
- Drizzle ORM → Cloudflare D1 (SQLite)
- KV namespace for BetterAuth session cache
- Alchemy IaC manages all CF resources, bindings, and migrations
- Env validation via `@opentab/config/env/*` (zod)

## Quick start (local)

1. `cp .env.example .env` and fill values (see comments for each).
2. `pnpm install` at the repo root.
3. `pnpm --filter @opentab/cloud dev` (= `alchemy dev`).
4. Open http://localhost:5173.

`alchemy dev` writes `.alchemy/local/wrangler.jsonc` (gitignored), starts
local D1 + KV emulators, applies pending migrations from
`./drizzle/migrations`, and runs `react-router dev`.

## Database

- Schema lives in `./drizzle/schema/`.
- Add a migration: edit schema → `pnpm db:generate`.
- Local migrations apply automatically on next `alchemy dev`.
- Remote migrations apply automatically on `alchemy deploy`.
- Inspect data: `pnpm db:studio`.
- Seed local DB with admin user: `pnpm db:seed:local` (requires
  `alchemy dev` to have run at least once).

## Deploy

Two paths, both via GitHub Actions. You do **not** run `alchemy deploy`
directly except in emergencies.

| Target | Trigger | Workflow |
|---|---|---|
| `dev` (https://opentab-dev.apprails.io) | Manual on `main` | Actions → Deploy → Run workflow |
| `prod` (https://opentab.apprails.io) | Push tag `v*.*.*` | Auto (waits for `production` reviewer approval) |

Required GitHub Secrets are listed in
[`docs/superpowers/specs/2026-04-24-apps-cloud-deployment-alchemy-design.md`](../../docs/superpowers/specs/2026-04-24-apps-cloud-deployment-alchemy-design.md)
§6.3.

## Emergency deploy from a laptop

```bash
ALCHEMY_STAGE=prod CI=true pnpm --filter @opentab/cloud deploy
```

You must hold `CLOUDFLARE_API_TOKEN`, `ALCHEMY_PASSWORD`,
`ALCHEMY_STATE_TOKEN`, and the production secrets locally. Prefer the GH
Actions path.

## Runbook

| Symptom | Cause | Fix |
|---|---|---|
| `alchemy deploy` 401 / 403 on first run | API token missing scopes | Add `D1:Edit`, `Workers Scripts:Edit`, `Workers KV:Edit`, `Workers Routes:Edit`, `DNS:Edit` (apprails.io zone) |
| State unreadable after first deploy | `ALCHEMY_PASSWORD` was changed | Restore old password, or set `forceUpdate: true` in `alchemy.run.ts` once to re-adopt resources |
| `CustomDomain` create fails | `apprails.io` zone not on CF | Add the zone to CF dashboard first |
| `pnpm db:seed:local` errors with "Local D1 file not found" | Never ran `alchemy dev` | Run `pnpm dev` once to materialize the local emulator |
| New developer cannot run `pnpm dev` | Missing or incomplete `.env` | `cp .env.example .env` and fill secrets; the parse error names the missing keys |
| Build fails with `cloudflare:workers` not resolved | `.alchemy/local/wrangler.jsonc` missing AND vite SSR builtins fallback misconfigured | Run `alchemy dev` once, or check `vite.config.ts`'s fallback `environments.ssr.resolve.builtins` |

## Destroy

```bash
pnpm --filter @opentab/cloud destroy
```

Deletes **all** resources for the current `ALCHEMY_STAGE` including D1
data. Manual only — never wired to CI. D1 has no point-in-time restore;
treat this command as permanent.
```

- [ ] **Step 2: Commit**

```bash
git add apps/cloud/README.md
git commit -m "docs(cloud): rewrite README for Alchemy IaC + operator runbook"
```

---

### Task 18: Update root `README.md` with Phase 1 cross-link

**Files:**
- Modify: `README.md` (root)

**What and why:** The root README currently says "Phase 0 (current): Extension runs local-first only. Phase 1 will introduce ...". Phase 1 is now in progress; add the new deployment spec link.

- [ ] **Step 1: Locate the existing Phase 0 / Phase 1 paragraph in `README.md`**

It currently reads:

```
**Phase 0 (current)**: Extension runs local-first only. Phase 1 will introduce `apps/cloud` (React Router 7 + Cloudflare Workers).

See [Phase 1 design spec](docs/superpowers/specs/2026-04-24-apps-cloud-design.md) and [Phase 1 plan](docs/superpowers/plans/2026-04-24-apps-cloud.md).
```

- [ ] **Step 2: Replace with**

```
**Phase 1 (in progress)**: `apps/cloud` — React Router v7 + Cloudflare Workers + D1 + KV. Deployment is managed by Alchemy IaC.

See:
- [Product design](docs/superpowers/specs/2026-04-24-apps-cloud-design.md)
- [Deployment design (Alchemy IaC)](docs/superpowers/specs/2026-04-24-apps-cloud-deployment-alchemy-design.md)
- [Phase 1 plan](docs/superpowers/plans/2026-04-24-apps-cloud.md)
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: phase 1 in progress; cross-link deployment design"
```

---

# Group 6 — CI workflows

Extend the existing `ci.yml` (today: lint + check-types only) to add `test` and `build` jobs. Create a new `deploy.yml` per spec §6.2.

### Task 19: Extend `.github/workflows/ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

**What and why:** Today's `ci.yml` runs lint + check-types in a single job. Spec §6.1 calls for separate `lint`, `typecheck`, `test`, `build` jobs sequenced via `needs`. Extending preserves the existing concurrency group and trigger config.

- [ ] **Step 1: Replace `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint:
    name: Biome lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    needs: lint
    name: Type check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check-types

  test:
    needs: typecheck
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @opentab/config test
      - run: pnpm --filter @opentab/cloud test

  build:
    needs: typecheck
    name: Build (smoke)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @opentab/cloud build
```

(Node and action versions are kept at 22 / v4 to stay consistent with the existing workflow. The spec called for newer versions; use existing convention to avoid bundling unrelated upgrades.)

- [ ] **Step 2: Validate the YAML**

```bash
pnpm dlx @action-validator/cli .github/workflows/ci.yml 2>/dev/null || echo "validator not available; manually inspect"
```

Or inspect with `cat .github/workflows/ci.yml` and confirm the structure matches the snippet above.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: split lint/typecheck/test/build into separate jobs"
```

---

### Task 20: Create `.github/workflows/deploy.yml`

**Files:**
- Create: `.github/workflows/deploy.yml`

**What and why:** Single workflow handling both `dev` (manual on main) and `prod` (tag `v*.*.*`). Branch detection in `resolve-stage`; environment-scoped secrets resolved by GH automatically.

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

concurrency:
  group: deploy-${{ github.ref_name }}
  cancel-in-progress: false

on:
  workflow_dispatch:
  push:
    tags: ['v*.*.*']

permissions:
  contents: read
  deployments: write

jobs:
  resolve-stage:
    name: Resolve target stage
    runs-on: ubuntu-latest
    outputs:
      stage:    ${{ steps.flag.outputs.stage }}
      env_name: ${{ steps.flag.outputs.env_name }}
      app_url:  ${{ steps.flag.outputs.app_url }}
    steps:
      - id: flag
        shell: bash
        run: |
          if [[ "$GITHUB_REF" == refs/tags/v*.*.* ]]; then
            echo "stage=prod"          >> "$GITHUB_OUTPUT"
            echo "env_name=production" >> "$GITHUB_OUTPUT"
            echo "app_url=https://opentab.apprails.io" >> "$GITHUB_OUTPUT"
          else
            if [ "$GITHUB_REF_NAME" != "main" ]; then
              echo "::error::workflow_dispatch only allowed on main (got: $GITHUB_REF_NAME)"
              exit 1
            fi
            echo "stage=dev"     >> "$GITHUB_OUTPUT"
            echo "env_name=dev"  >> "$GITHUB_OUTPUT"
            echo "app_url=https://opentab-dev.apprails.io" >> "$GITHUB_OUTPUT"
          fi

  deploy:
    needs: resolve-stage
    name: Deploy → ${{ needs.resolve-stage.outputs.env_name }}
    runs-on: ubuntu-latest
    environment:
      name: ${{ needs.resolve-stage.outputs.env_name }}
      url:  ${{ needs.resolve-stage.outputs.app_url }}
    env:
      CI: "true"
      ALCHEMY_STAGE: ${{ needs.resolve-stage.outputs.stage }}
      APP_URL:       ${{ needs.resolve-stage.outputs.app_url }}

      # Account-level (repo-scoped, shared across stages)
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CLOUDFLARE_API_TOKEN:  ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ZONE_ID:    ${{ secrets.CLOUDFLARE_ZONE_ID }}
      ALCHEMY_PASSWORD:      ${{ secrets.ALCHEMY_PASSWORD }}
      ALCHEMY_STATE_TOKEN:   ${{ secrets.ALCHEMY_STATE_TOKEN }}

      # Environment-scoped — same name, different value per environment.
      # GH Actions resolves these from the active environment's secret store
      # based on `environment.name` above.
      BETTER_AUTH_SECRET:        ${{ secrets.BETTER_AUTH_SECRET }}
      BETTER_AUTH_ADMIN_USER_ID: ${{ secrets.BETTER_AUTH_ADMIN_USER_ID }}
      GITHUB_CLIENT_ID:          ${{ secrets.GITHUB_CLIENT_ID }}
      GITHUB_CLIENT_SECRET:      ${{ secrets.GITHUB_CLIENT_SECRET }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Deploy via Alchemy
        run: pnpm --filter @opentab/cloud deploy
```

Note: `release.yml` already runs on `tags: ["v*"]` to package the extension. The two workflows co-exist on the same tag — extension release zip + cloud prod deploy from the same version tag.

- [ ] **Step 2: Validate the YAML**

```bash
cat .github/workflows/deploy.yml | head -20
```

Confirm the structure matches the snippet.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add deploy workflow (manual dev + tag-driven prod)"
```

---

# Group 7 — Cross-link the product spec

The product spec (`2026-04-24-apps-cloud-design.md`) needs a single decision-row append pointing readers to this deployment spec.

### Task 21: Append decision row #33 to the product spec

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-apps-cloud-design.md`

**What and why:** Add a single row to §0.4 so readers of the product spec can find the deployment design. The product spec's existing decisions #1–#32 are unchanged.

- [ ] **Step 1: Locate the end of the §0.4 decision table**

The last row currently reads:

```
| 32 | Callback tab close | Prefer `chrome.tabs.getCurrent()` + `chrome.tabs.remove()`. `window.close()` is only a last-ditch fallback |
```

- [ ] **Step 2: Append the new row immediately after row 32**

```
| 33 | Deployment toolchain | Alchemy IaC; `apps/cloud/alchemy.run.ts` is the single source of truth for CF resources. See `2026-04-24-apps-cloud-deployment-alchemy-design.md` |
```

- [ ] **Step 3: Verify the table renders**

```bash
grep -n '^| 33 |' docs/superpowers/specs/2026-04-24-apps-cloud-design.md
```

Expected: prints one line with the new row.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-apps-cloud-design.md
git commit -m "docs(spec): cross-link deployment design from apps-cloud spec"
```

---

# Group 8 — Operator one-time setup + first deploy verification

This group is half operational, half code. It is the smoke test for everything Groups 1–7 built. Treat the steps as a checklist; they cannot be replayed by an agentic worker without operator credentials, so the agent's job is to **prepare the artifacts and stop, handing off to the operator for the actual deploy**.

### Task 22: Prepare operator handoff and run the first deploy

**Files:**
- None (operational tasks)

**What and why:** Before the GH Actions `deploy.yml` can succeed, the operator must (1) ensure the `apprails.io` zone is on Cloudflare, (2) create dev + prod GitHub OAuth apps, (3) mint the CF API token with the spec §5.2 scopes, (4) populate every GitHub secret in the §6.3 table, (5) run the first `alchemy deploy --stage dev` from a laptop to confirm everything wires correctly.

- [ ] **Step 1: Operator checklist (manual; not executable by agent)**

Confirm each item with the operator before triggering CI:

- [ ] `apprails.io` is hosted on Cloudflare DNS (CF dashboard → Add Site → use it as the registrar's nameservers, or as a subzone delegation).
- [ ] Two GitHub OAuth apps exist: one for dev (callback `https://opentab-dev.apprails.io/api/auth/callback/github`), one for prod (callback `https://opentab.apprails.io/api/auth/callback/github`). Record both `Client ID` and `Client Secret` for each.
- [ ] `BETTER_AUTH_SECRET` generated for dev and prod separately: `pnpm --filter @opentab/cloud auth:secret` × 2.
- [ ] CF API token minted with scopes per spec §5.2; copied to clipboard.
- [ ] CF zone ID for `apprails.io` copied (CF dashboard → zone → Overview → API → Zone ID).
- [ ] `ALCHEMY_PASSWORD` generated: `openssl rand -base64 32`.
- [ ] `ALCHEMY_STATE_TOKEN` minted: CF dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" template (or equivalent).
- [ ] All 14 GitHub secrets per spec §6.3 table created in the right scope (repo vs. `dev` environment vs. `production` environment).
- [ ] GH `production` environment configured with required reviewers (recommended).

- [ ] **Step 2: Operator dry run (laptop, dev stage)**

Operator runs locally, with a freshly populated `apps/cloud/.env`:

```bash
cd apps/cloud
ALCHEMY_STAGE=dev pnpm dev
```

Expected:
- `.alchemy/local/wrangler.jsonc` is generated.
- Local D1 + KV emulators start.
- Drizzle migrations apply (look for `applying migration 0000_...` log lines).
- Vite server starts at http://localhost:5173.
- Visiting the URL renders the BetterAuth login page without 500s.

If any step fails, fix locally and re-run before continuing.

- [ ] **Step 3: First remote deploy to `dev` (operator, laptop)**

```bash
cd apps/cloud
ALCHEMY_STAGE=dev pnpm deploy
```

Expected:
- Alchemy authenticates to CF.
- New resources created: `opentab-cloud-dev-db`, `opentab-cloud-dev-kv`, `opentab-cloud-dev-worker`.
- Drizzle migrations apply to the remote D1.
- Custom domain `opentab-dev.apprails.io` bound; DNS record created in `apprails.io` zone.
- Final log line prints `{ url: 'https://opentab-dev.apprails.io' }`.
- Smoke test: `curl -I https://opentab-dev.apprails.io` returns 200 (or 302 to login).

If deploy fails:
- 401 / 403 → CF API token missing a scope (see spec §5.2). Re-mint and update `CLOUDFLARE_API_TOKEN` env.
- DNS errors → confirm `apprails.io` zone is on CF.
- "AlchemyEnv parse failed" → fill missing `.env` keys.

- [ ] **Step 4: Trigger the GH Actions `deploy.yml` for dev**

In the GH UI: Actions → Deploy → Run workflow → confirm `main` branch is selected → Run.

Expected: the workflow run succeeds end-to-end. The deployed worker URL matches the manual deploy in Step 3 (no diff in state).

- [ ] **Step 5: Document the deploy in the PR description / release notes**

Note in the merge PR (or in `docs/superpowers/plans/2026-04-24-apps-cloud-deployment-alchemy.md` as a postscript):
- The exact commit SHA deployed to dev.
- Link to the GH Actions run.
- Any operator surprises that should be added to the runbook.

- [ ] **Step 6: Commit if any postscript was added**

```bash
git add docs/superpowers/plans/2026-04-24-apps-cloud-deployment-alchemy.md
git commit -m "docs(plan): postscript with first-deploy notes"
```

---

## Plan completion definition of done

- [ ] All Tasks 1–22 complete; each one committed.
- [ ] `pnpm lint`, `pnpm check-types`, `pnpm --filter @opentab/cloud test`, `pnpm --filter @opentab/config test`, `pnpm --filter @opentab/cloud build` all pass at root.
- [ ] `apps/cloud/wrangler.jsonc` and `apps/cloud/wrangler.jsonc.example` are absent from git. `apps/cloud/worker-configuration.d.ts` exists as a hand shim (Task 13).
- [ ] `git grep -nE 'wrangler|@cloudflare/vite-plugin' apps/cloud/workers apps/cloud/app apps/cloud/drizzle apps/cloud/vite.config.ts apps/cloud/alchemy.run.ts packages/config/src` returns zero hits — both packages stay in `apps/cloud/package.json` intentionally (alchemy peer / runtime import) but no source file calls them directly.
- [ ] CI workflows present at `.github/workflows/{ci,deploy}.yml`.
- [ ] Operator has performed Task 22 (first deploy succeeded; dev URL responds).
