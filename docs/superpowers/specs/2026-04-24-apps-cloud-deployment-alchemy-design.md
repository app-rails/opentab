# apps/cloud — Deployment Tooling (Alchemy IaC) Design

**Date:** 2026-04-24
**Status:** Approved
**Scope:** Define how `apps/cloud` provisions Cloudflare resources (D1, KV,
Worker, Custom Domain) and deploys to dev / prod, replacing the scaffold's
hand-written `wrangler.jsonc` + `wrangler deploy` flow with
[Alchemy](https://alchemy.run) IaC. Local development, CI workflows, env
validation layer, secrets handling, and operator runbook are all in scope.

> **Peer spec.** This document is a sibling of
> `2026-04-24-apps-cloud-design.md` (the product / architecture design for
> `apps/cloud`). The product-level decisions there (D1 + KV, BetterAuth,
> sync protocol, Phase 0/1/2 split, etc.) are **unchanged**. Only the
> *tooling that provisions and deploys* the application changes.
>
> When the two specs disagree, the product spec wins on product behavior;
> this spec wins on infrastructure and deployment mechanics.

---

## 0. Introduction

### 0.1 Goal

Make `apps/cloud/alchemy.run.ts` the single source of truth for every
Cloudflare resource the app touches — Worker, D1 database, KV namespace,
Custom Domain, environment bindings, secrets — and reduce the day-to-day
deploy / dev story to two commands:

- `pnpm --filter @opentab/cloud dev`   → local emulator + auto-migrations
- `pnpm --filter @opentab/cloud deploy` → remote provision + auto-migrations

CI calls only `deploy` (with stage-aware env injection); no human runs
`wrangler` directly.

### 0.2 Non-goals

- No multi-tenant or per-PR ephemeral environments.
- No staging stage in CI (the `staging` enum value is reserved for future
  use; no workflow consumes it now).
- No new Cloudflare services. D1 + KV remain the only bound resources, per
  product spec §0.4 #11.
- No changes to BetterAuth / Drizzle / RR7 application code. Only build,
  deploy, and env-validation infrastructure changes.
- No PR preview deploys (deferred indefinitely).

### 0.3 Starting point

- `apps/cloud/` exists with a hand-written `wrangler.jsonc` carrying
  placeholder `database_id` / KV `id` (`PLACEHOLDER_CREATE_AFTER_RUN`).
  No real Cloudflare resources have been provisioned yet, so there is no
  existing remote state to migrate from.
- `package.json` scripts use `wrangler deploy`, `wrangler d1 migrations
  apply`, and `wrangler types` for Cloudflare-side typegen.
- `packages/config/` is an empty placeholder (`@opentab/config`, only a
  `tsconfig.base.json`); env validation is currently absent across the
  monorepo.
- Reference implementation:
  `~/code/github/app-rails/shiprails/apps/saas-edge-template/` — a mature
  Alchemy + RR7 + CF Workers project (uses Hyperdrive + Postgres rather
  than D1, but the IaC patterns transfer 1:1).
- Reference CI patterns:
  `~/code/github/app-rails/aduplift/.github/workflows/deploy.yaml` —
  branch-aware single-workflow deploy with environment-scoped secrets.

### 0.4 Decision snapshot

| # | Area | Decision |
|---|---|---|
| 1 | Tooling boundary | Alchemy owns **all** CF resource provisioning, local dev emulation, and remote deploys. `wrangler.jsonc` and `wrangler.jsonc.example` are deleted from the repo |
| 2 | Stage model | zod enum `dev / staging / prod`. `staging` is reserved (no CI workflow consumes it). `prod` requires `CI=true` |
| 3 | Resource naming | Hardcoded `opentab-cloud-${stage}-{worker, kv, db}`. No rebrand abstraction |
| 4 | D1 migrations | Alchemy `D1Database` with `migrationsDir: "./drizzle/migrations"` + `migrationsTable: "d1_migrations"`. Migrations apply automatically on `alchemy dev` (local) and `alchemy deploy` (remote) |
| 5 | env validation | zod schemas live in `packages/config/src/env/`. Four entrypoints exposed: `./env/schemas`, `./env/node`, `./env/worker`, `./env/browser` (browser is a placeholder) |
| 6 | State store | `CloudflareStateStore` (self-provisioned on the CF account; no R2 bucket needed). `ALCHEMY_STATE_TOKEN` and `ALCHEMY_PASSWORD` are **never rotated** after first deploy |
| 7 | CI triggers | One `ci.yml` (PR + push main → lint/typecheck/test/build); one `deploy.yml` (workflow_dispatch on `main` → dev; tag `v*.*.*` → prod). PRs do not deploy |
| 8 | Custom domains | `dev` → `opentab-dev.apprails.io`; `prod` → `opentab.apprails.io`. Bound declaratively via Alchemy `WorkersCustomDomain`. Requires `apprails.io` zone hosted on Cloudflare |
| 9 | OAuth isolation | One GitHub OAuth app per stage. env schema exposes a single `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` pair; CI selects the per-stage value via GitHub Actions environment-scoped secrets (same secret name, different values per environment) |
| 10 | `alchemy destroy` | Manual only. Never wired to CI. Destroys all resources for the stage including D1 data |
| 11 | Local dev DB path | Owned by `alchemy dev` via miniflare-style emulation (`.alchemy/local/`). `db:seed:local` and `db:studio` continue to work; the exact local D1 file path resolution is finalized in the implementation plan |
| 12 | DX artifacts | `apps/cloud/.env.example`, `apps/cloud/README.md`, root `README.md`, and `apps/cloud/.gitignore` are all updated as part of the migration |

---

## 1. Architecture

### 1.1 Topology

```
                    ┌──────────────────────────────┐
                    │  apps/cloud/alchemy.run.ts   │
                    │  (single source of truth)    │
                    └──────────────┬───────────────┘
                                   │ alchemy deploy
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │  Cloudflare account / stage = ${ALCHEMY_STAGE}   │
        │  ┌────────────────────────────────────────────┐  │
        │  │ ReactRouter Worker                         │  │
        │  │   name: opentab-cloud-${stage}-worker      │  │
        │  │   bindings:                                │  │
        │  │     DB         → D1Database (migrations)   │  │
        │  │     APP_KV     → KVNamespace               │  │
        │  │     APP_URL, BETTER_AUTH_SECRET,           │  │
        │  │     BETTER_AUTH_ADMIN_USER_ID,             │  │
        │  │     GITHUB_CLIENT_ID/SECRET                │  │
        │  │   custom domain: opentab[-dev].apprails.io │  │
        │  └────────────────────────────────────────────┘  │
        │  ┌────────────────────┐  ┌──────────────────┐    │
        │  │ D1Database         │  │ KVNamespace      │    │
        │  │  opentab-cloud-    │  │  opentab-cloud-  │    │
        │  │  ${stage}-db       │  │  ${stage}-kv     │    │
        │  │  migrationsDir:    │  │  (BetterAuth     │    │
        │  │  ./drizzle/        │  │   session cache) │    │
        │  │   migrations       │  │                  │    │
        │  └────────────────────┘  └──────────────────┘    │
        │  state → CloudflareStateStore (per-stage scope)  │
        └──────────────────────────────────────────────────┘
```

### 1.2 Stage model

| Stage    | URL                            | CI workflow that targets it                | Notes |
|----------|--------------------------------|--------------------------------------------|-------|
| `dev`    | `https://opentab-dev.apprails.io` | `deploy.yml` (workflow_dispatch, main only) | Day-to-day shared remote env |
| `staging`| reserved (no URL)              | none                                       | Enum value retained for future expansion |
| `prod`   | `https://opentab.apprails.io`  | `deploy.yml` (push tag `v*.*.*`)           | Requires `CI=true`; GH `production` environment can require reviewers |

`alchemy.run.ts` enforces:

```ts
if (env.ALCHEMY_STAGE === "prod" && env.CI !== "true") {
  throw new Error("ALCHEMY_STAGE=prod is only allowed in CI ...");
}
```

### 1.3 Resource naming

| Logical name      | Concrete name (per stage)         |
|-------------------|-----------------------------------|
| Worker            | `opentab-cloud-${stage}-worker`   |
| D1 database       | `opentab-cloud-${stage}-db`       |
| KV namespace      | `opentab-cloud-${stage}-kv`       |
| Custom domain     | `opentab[-${stage}].apprails.io` (omit `-${stage}` for `prod`) |

The names are constructed by string template in `alchemy.run.ts`. There is
no rebrand abstraction (`opentab-cloud` is a literal). If the project name
ever changes, the rename is a single-line edit followed by a one-time
migration (delete old resources, deploy new — no in-place rename API
exists in the CF API).

---

## 2. Alchemy resource definitions

`apps/cloud/alchemy.run.ts` (target shape — implementation will follow this
contract; load-bearing details only):

```ts
import alchemy from "alchemy";
import {
  D1Database,
  KVNamespace,
  ReactRouter,
  WorkersCustomDomain,
} from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { getAlchemyEnv } from "@opentab/config/env/node";

const env = getAlchemyEnv();

// Stage-level safety: prod only in CI.
if (env.ALCHEMY_STAGE === "prod" && env.CI !== "true") {
  throw new Error(
    "ALCHEMY_STAGE=prod is only allowed in CI. " +
      "Use ALCHEMY_STAGE=dev locally; tag v*.*.* to ship prod via Actions.",
  );
}

const appName = "opentab-cloud";
const app = await alchemy(appName, {
  stage: env.ALCHEMY_STAGE,
  stateStore: (scope) => new CloudflareStateStore(scope),
  password: env.ALCHEMY_PASSWORD,
});

const prefix = `${appName}-${env.ALCHEMY_STAGE}`;
const hostname =
  env.ALCHEMY_STAGE === "prod"
    ? "opentab.apprails.io"
    : `opentab-${env.ALCHEMY_STAGE}.apprails.io`;

const db = await D1Database("db", {
  name: `${prefix}-db`,
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
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_ADMIN_USER_ID: env.BETTER_AUTH_ADMIN_USER_ID,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: alchemy.secret.env.GITHUB_CLIENT_SECRET,
  },
});

await WorkersCustomDomain("custom-domain", {
  name: hostname,
  worker,
  zoneId: env.CLOUDFLARE_ZONE_ID, // apprails.io zone
});

console.log({ url: `https://${hostname}` });

await app.finalize();
```

Key choices:

- `alchemy.secret.env.X` — used for true secrets (signing keys, OAuth
  secret). Throws at plan time if the env var is missing. The value is
  encrypted at rest in CloudflareStateStore using `ALCHEMY_PASSWORD`.
- `env.X` (plain) — used for non-secret bindings (`APP_URL`,
  `GITHUB_CLIENT_ID`, `BETTER_AUTH_ADMIN_USER_ID`).
- `D1Database`'s `migrationsDir` + `migrationsTable` makes Alchemy own the
  migration application step — no separate `wrangler d1 migrations apply`
  command is needed, locally or remotely.
- `WorkersCustomDomain` requires `CLOUDFLARE_ZONE_ID` for the
  `apprails.io` zone (added to the env schema; obtained from CF dashboard
  → DNS → Overview).

---

## 3. Env validation layer (`packages/config/src/env/`)

### 3.1 Layout

```
packages/config/
├── package.json        # exports: ./env/{schemas,node,worker,browser}
├── tsconfig.json
└── src/env/
    ├── schemas.ts      # zod: BaseSchema, WorkerEnvSchema, AlchemyEnvSchema
    ├── node.ts         # dotenv/config + parse process.env
    ├── worker.ts       # parse Cloudflare context.env
    └── browser.ts      # placeholder (export {} — kept so future imports are stable)
```

`package.json` exports map (subpath each runtime imports separately so
worker bundles never pull `dotenv`):

```json
{
  "name": "@opentab/config",
  "type": "module",
  "exports": {
    "./env/schemas": "./src/env/schemas.ts",
    "./env/node":    "./src/env/node.ts",
    "./env/worker":  "./src/env/worker.ts",
    "./env/browser": "./src/env/browser.ts"
  },
  "dependencies": { "dotenv": "<pin>", "zod": "<pin>" }
}
```

Pin `zod` to the same major already present in `apps/cloud` to avoid two
zod copies in the monorepo. Pin `dotenv` to its current latest stable.
The implementation plan resolves the exact versions.

### 3.2 Schemas

Two-layer pattern (matches shiprails reference, simplified for opentab):

- **`BaseSchema`** — minimal floor. Every node entry pays this:
  - `NODE_ENV: enum("development","production","test")` (default `development`)
  - `CI: string().optional()`
- **`WorkerEnvSchema`** — what the Worker runtime sees from CF bindings:
  - `APP_URL: url()` (must be `https://`)
  - `BETTER_AUTH_SECRET: string().min(32)`
  - `BETTER_AUTH_ADMIN_USER_ID: string().min(1)`
  - `GITHUB_CLIENT_ID: string().min(1)`
  - `GITHUB_CLIENT_SECRET: string().min(1)`
- **`AlchemyEnvSchema`** — `BaseSchema.extend(WorkerEnvSchema.shape).extend({ ... })`,
  adding the IaC-specific fields:
  - `ALCHEMY_STAGE: enum("dev","staging","prod")`
  - `ALCHEMY_PASSWORD: string().min(8)`
  - `ALCHEMY_STATE_TOKEN: string().min(1)`
  - `CLOUDFLARE_ACCOUNT_ID: string().min(1)`
  - `CLOUDFLARE_API_TOKEN: string().min(1)`
  - `CLOUDFLARE_ZONE_ID: string().min(1)` (for `apprails.io` zone)
  - `superRefine` cross-checks:
    - For `dev` and `prod`, `APP_URL` must match the per-stage hostname
      (`opentab.apprails.io` for prod, `opentab-dev.apprails.io` for dev) —
      guards against mis-routed deploys.
    - For `staging`, the schema rejects with a clear "staging is reserved
      but not wired" message until a future change adds its hostname.
    - `prod` stage forces `CI === "true"` (defense in depth; the runtime
      check in `alchemy.run.ts` is the primary enforcer).

### 3.3 Entrypoints

```ts
// node.ts
import "dotenv/config";
import { BaseSchema, AlchemyEnvSchema } from "./schemas";
export const env = BaseSchema.parse(process.env);
export function getAlchemyEnv() { return AlchemyEnvSchema.parse(process.env); }

// worker.ts
import { WorkerEnvSchema } from "./schemas";
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;
export function parseWorkerEnv(ctxEnv: unknown): WorkerEnv {
  return WorkerEnvSchema.parse(ctxEnv);
}

// browser.ts
export {}; // placeholder; populated when first VITE_* var is needed
```

`getAlchemyEnv()` is called only from `alchemy.run.ts` (and from
`drizzle.config.ts` if it ever needs DB credentials in the future).
`parseWorkerEnv()` is called once at the top of the Worker entrypoint
(`apps/cloud/workers/app.ts`); the result is stashed on the request
context for handlers to consume.

---

## 4. Local development

### 4.1 The `alchemy dev` flow

```bash
pnpm --filter @opentab/cloud dev   # = alchemy dev
```

Sequence:

1. `alchemy dev` reads `.env` (via `packages/config`'s dotenv load) and
   parses against `AlchemyEnvSchema`. Missing or invalid env → fail-fast
   with a zod error.
2. Operates in `Scope.local`: does **not** touch the CloudflareStateStore;
   does **not** create remote resources.
3. Generates `.alchemy/local/wrangler.jsonc` with local D1 + KV bindings
   (file is gitignored).
4. The Vite plugin (`alchemy/cloudflare/react-router`) detects the
   generated wrangler file and wires Vite to the local emulator.
5. Pending Drizzle migrations from `./drizzle/migrations` are applied to
   the local D1 emulator before the dev server starts serving requests.
6. `react-router dev` boots; the app is reachable at
   `http://localhost:5173`.

### 4.2 `vite.config.ts` plugin gating

Mirrors shiprails' pattern: the Alchemy Vite plugin is only registered
when `.alchemy/local/wrangler.jsonc` exists. This ensures `pnpm build` and
`react-router build` work on a fresh clone (CI typecheck / build job)
without first running `alchemy dev`. Concrete gate:

```ts
const wranglerPath = resolve(__dirname, ".alchemy/local/wrangler.jsonc");
const alchemyPlugins = existsSync(wranglerPath) ? [alchemyPlugin()] : [];
```

When the plugin is absent, register `cloudflare:*` specifiers as SSR
builtins so Vite externalizes them (the CF runtime resolves them at
deploy time).

### 4.3 Database scripts

`apps/cloud/package.json` after migration:

| Script | Purpose | Runtime |
|---|---|---|
| `dev`            | `alchemy dev`                              | local emulator |
| `build`          | `react-router build`                       | static build |
| `deploy`         | `alchemy deploy`                           | remote provision + deploy |
| `destroy`        | `alchemy destroy`                          | remote teardown (manual only) |
| `typecheck`      | `react-router typegen && tsc -b`           | CI + local |
| `lint`           | `biome check .`                            | CI + local |
| `test`           | `vitest run`                               | CI + local |
| `db:generate`    | `drizzle-kit generate`                     | manual after schema edit |
| `db:studio`      | `drizzle-kit studio`                       | local inspection |
| `db:seed:local`  | `tsx ./drizzle/seed/seed.ts`               | local; targets the emulator's D1 file |
| `auth:secret`    | `pnpm dlx @better-auth/cli@latest secret`  | one-off helper |
| `auth:generate`  | `pnpm dlx @better-auth/cli@latest generate ...` | regenerate auth schema |

**Removed** vs. the current pre-Alchemy state: `cf-typegen`, `typegen`
(superseded by `alchemy dev`'s typegen + RR's typegen), `db:migrate:local`,
`db:migrate:remote`, `db:drop`, and `wrangler` itself as a dependency.

`db:seed:local` continues to use `@libsql/client` against the local D1
file. Its path resolution shifts from wrangler's `.wrangler/state/` to
Alchemy's `.alchemy/local/` — the seed script reads the path from
`.alchemy/local/wrangler.jsonc` (or accepts a `--db-path` arg). Detail of
exactly which file shape is finalized in the plan, but the script
contract — "seed the local emulator's D1 with default users" — is
unchanged.

`db:studio` similarly reads the local D1 file path from the generated
wrangler config. Both scripts assume `alchemy dev` has been run at least
once (so `.alchemy/local/` exists).

---

## 5. Remote deployment

### 5.1 Command

```bash
ALCHEMY_STAGE=<stage> [CI=true] pnpm --filter @opentab/cloud deploy
```

`alchemy deploy`:

1. Parses env via `AlchemyEnvSchema` — fail-fast.
2. Authenticates to CF using `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`.
3. Reads the existing state for `stage` from CloudflareStateStore.
4. Plans: diff declared resources vs. state. Creates / updates only what
   changed.
5. For `D1Database`: applies any new entries in `./drizzle/migrations`
   that are not yet in the `d1_migrations` tracking table.
6. Builds the worker (via `react-router build`), uploads, replaces the
   live worker version.
7. Updates `WorkersCustomDomain` if the hostname / zone changed.
8. Writes new state back to CloudflareStateStore.
9. Prints the resulting `https://<hostname>` URL.

### 5.2 Required CF API token scopes

- `Account.Workers Scripts:Edit`
- `Account.D1:Edit`
- `Account.Workers KV Storage:Edit`
- `Account.Workers Routes:Edit`
- `Zone.DNS:Edit` (limited to `apprails.io` zone)

Aim for minimum-privilege. Alchemy may surface additional scope
requirements at first deploy (e.g. account read for resource discovery);
treat the failing API call as the source of truth and append scopes
incrementally rather than starting with a wide token.

---

## 6. CI workflows

Two files, both in `.github/workflows/`.

### 6.1 `ci.yml`

Triggers: every PR + every push to `main`. No deploy. Gates the codebase.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  lint:
    name: Biome lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: biomejs/setup-biome@v2
      - run: biome ci . --reporter=github

  typecheck:
    needs: lint
    name: Type check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @opentab/cloud typecheck

  test:
    needs: typecheck
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @opentab/cloud test

  build:
    needs: typecheck
    name: Build (smoke)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @opentab/cloud build
```

`build` validates the worker bundle compiles without needing CF
credentials. No CF / Alchemy secrets are referenced.

### 6.2 `deploy.yml`

Triggers:

- `workflow_dispatch` from `main` → `dev`
- push tag matching `v*.*.*` → `prod`

Does **not** repeat lint / typecheck (already gated by `ci.yml` for any
commit on `main`; tags can only meaningfully be cut from `main`).

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
            echo "stage=prod"        >> "$GITHUB_OUTPUT"
            echo "env_name=production" >> "$GITHUB_OUTPUT"
            echo "app_url=https://opentab.apprails.io" >> "$GITHUB_OUTPUT"
          else
            if [ "$GITHUB_REF_NAME" != "main" ]; then
              echo "::error::workflow_dispatch only allowed on main (got: $GITHUB_REF_NAME)"
              exit 1
            fi
            echo "stage=dev"      >> "$GITHUB_OUTPUT"
            echo "env_name=dev"   >> "$GITHUB_OUTPUT"
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

      # Account-level (repo secrets, shared across stages)
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CLOUDFLARE_API_TOKEN:  ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ZONE_ID:    ${{ secrets.CLOUDFLARE_ZONE_ID }}
      ALCHEMY_PASSWORD:      ${{ secrets.ALCHEMY_PASSWORD }}
      ALCHEMY_STATE_TOKEN:   ${{ secrets.ALCHEMY_STATE_TOKEN }}

      # Environment-scoped — same name, different value per environment.
      # GitHub Actions resolves these from the `dev` or `production`
      # environment's secret store automatically based on `environment.name`.
      BETTER_AUTH_SECRET:        ${{ secrets.BETTER_AUTH_SECRET }}
      BETTER_AUTH_ADMIN_USER_ID: ${{ secrets.BETTER_AUTH_ADMIN_USER_ID }}
      GITHUB_CLIENT_ID:          ${{ secrets.GITHUB_CLIENT_ID }}
      GITHUB_CLIENT_SECRET:      ${{ secrets.GITHUB_CLIENT_SECRET }}
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @opentab/cloud deploy
```

Guards in place:

- `resolve-stage` rejects non-`main` `workflow_dispatch` invocations
  before any deploy step runs.
- `concurrency` group serializes deploys per ref (a second tag push or
  manual run waits rather than racing).
- GitHub `production` environment can be configured (in repo settings →
  Environments) with **required reviewers** so prod tag deploys pause for
  manual approval.
- `alchemy.run.ts` itself enforces `prod ⇒ CI=true`.

### 6.3 GitHub Secrets configuration

| Location                  | Secret                       | Purpose |
|---------------------------|------------------------------|---------|
| Repo (account-level)      | `CLOUDFLARE_ACCOUNT_ID`      | CF account identifier |
| Repo                      | `CLOUDFLARE_API_TOKEN`       | CF API token (scopes per §5.2) |
| Repo                      | `CLOUDFLARE_ZONE_ID`         | `apprails.io` zone ID |
| Repo                      | `ALCHEMY_PASSWORD`           | Encrypts secrets at rest in state |
| Repo                      | `ALCHEMY_STATE_TOKEN`        | CloudflareStateStore access |
| Environment `dev`         | `BETTER_AUTH_SECRET`         | dev signing key |
| Environment `dev`         | `BETTER_AUTH_ADMIN_USER_ID`  | dev admin user |
| Environment `dev`         | `GITHUB_CLIENT_ID`           | dev OAuth app ID |
| Environment `dev`         | `GITHUB_CLIENT_SECRET`       | dev OAuth app secret |
| Environment `production`  | `BETTER_AUTH_SECRET`         | prod signing key |
| Environment `production`  | `BETTER_AUTH_ADMIN_USER_ID`  | prod admin user |
| Environment `production`  | `GITHUB_CLIENT_ID`           | prod OAuth app ID |
| Environment `production`  | `GITHUB_CLIENT_SECRET`       | prod OAuth app secret |

The four environment-scoped secrets share names across `dev` and
`production`; GH automatically resolves each `${{ secrets.X }}` against
the active environment.

---

## 7. Migration from the current wrangler setup

The project has never been deployed against real CF resources (placeholders
in `wrangler.jsonc`), so there is no remote-state migration. The cutover is
purely repo-local. Implementation tasks (sequenced in the plan):

1. **`packages/config`**: add `src/env/{schemas,node,worker,browser}.ts`,
   update `package.json` exports + dependencies (`zod`, `dotenv`).
2. **`apps/cloud/alchemy.run.ts`**: write per §2; import env via
   `@opentab/config/env/node`.
3. **`apps/cloud/vite.config.ts`**: add the gated Alchemy plugin per §4.2.
4. **`apps/cloud/workers/app.ts`**: parse `context.cloudflare.env` via
   `parseWorkerEnv` from `@opentab/config/env/worker`; expose typed env
   to handlers.
5. **`apps/cloud/package.json`**: replace scripts per §4.3; remove
   `wrangler` from `devDependencies`; add `alchemy` dep.
6. **Delete** `apps/cloud/wrangler.jsonc` and
   `apps/cloud/wrangler.jsonc.example`.
7. **`apps/cloud/.env.example`** — rewrite per §8.1.
8. **`apps/cloud/README.md`** — rewrite per §8.2.
9. **Root `README.md`** — add cross-link per §8.3.
10. **`apps/cloud/.gitignore`** — append `.alchemy/`.
11. **Add** `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`
    per §6.
12. **Operator one-time setup** (manual, not in code): ensure
    `apprails.io` zone is on Cloudflare; create `dev` and `prod` GitHub
    OAuth apps; mint a CF API token with §5.2 scopes; populate all
    secrets per §6.3.
13. **First `alchemy deploy --stage dev`** (manual run) — confirms
    resource creation, migrations apply, custom domain resolves.
14. **Cross-link** in `2026-04-24-apps-cloud-design.md` §0.4: add a
    decision row pointing to this spec for deployment toolchain.

---

## 8. DX & onboarding artifacts

### 8.1 `apps/cloud/.env.example`

Replace the scaffold's version with sectioned content. Each variable
carries an inline comment explaining what it is, how to obtain it, and
notable constraints. Skeleton:

```bash
# ============================================================================
# Alchemy infrastructure
# ============================================================================
# Target stage. Local dev uses `dev`. CI sets this per workflow.
# Allowed: dev | staging | prod
ALCHEMY_STAGE=dev

# Encrypts secrets at rest in Alchemy state.
# Generate: `openssl rand -base64 32`
# IMPORTANT: never change after first deploy — would orphan stored secrets.
ALCHEMY_PASSWORD=

# CloudflareStateStore access token.
# Generate via CF dashboard → My Profile → API Tokens.
# IMPORTANT: never rotate — loss requires forceUpdate recovery.
ALCHEMY_STATE_TOKEN=

# Set to "true" only inside CI. Required when ALCHEMY_STAGE=prod.
# CI=true

# ============================================================================
# Cloudflare account
# ============================================================================
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=

# ============================================================================
# Application config (per stage; values below are dev defaults)
# ============================================================================
# Public URL of this stage. Must match the Custom Domain in alchemy.run.ts.
APP_URL=https://opentab-dev.apprails.io

# BetterAuth signing secret.
# Generate: `pnpm --filter @opentab/cloud auth:secret`
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

### 8.2 `apps/cloud/README.md`

Replace the scaffold's Google-OAuth / wrangler / todos-demo README with an
opentab-specific one. Required sections:

- **Title** + one-line description
- **Architecture** — RR7 + Alchemy + CF Workers + D1 + KV; BetterAuth +
  Drizzle
- **Quick start (local)** — `cp .env.example .env`, fill values,
  `pnpm install`, `pnpm --filter @opentab/cloud dev`
- **Database** — schema location, `db:generate` flow, auto-apply on
  `alchemy dev` / `alchemy deploy`, `db:studio`, `db:seed:local`
- **Deploy** — table mapping (target → trigger → workflow); cross-link to
  this spec for full secret list
- **Emergency deploy from laptop** — the explicit
  `ALCHEMY_STAGE=prod CI=true pnpm ... deploy` form, with a warning to
  prefer the GH Actions path
- **Runbook** — symptom / cause / fix table for common operator failures
  (token scopes, password change, missing zone, missing `.env`)
- **Destroy** — `alchemy destroy` is local-only, deletes data, never wired
  to CI

### 8.3 Root `README.md`

Replace the existing "Phase 0 (current) ... Phase 1 will introduce ..."
note with a Phase 1 status update and a cross-link:

```markdown
**Phase 1 (in progress)**: `apps/cloud` — RR7 + Cloudflare Workers + D1 + KV.

See:
- [Phase 1 product design](docs/superpowers/specs/2026-04-24-apps-cloud-design.md)
- [Deployment design (Alchemy IaC)](docs/superpowers/specs/2026-04-24-apps-cloud-deployment-alchemy-design.md)
```

### 8.4 `apps/cloud/.gitignore`

Append:
```
.alchemy/
```

(`.env` and `.dev.vars*` are already covered.)

---

## 9. Tradeoffs

| Choice | Picked | Alternative | Why |
|---|---|---|---|
| Provisioning tool | Alchemy IaC (`alchemy.run.ts`) | wrangler CLI + hand-written `wrangler.jsonc` | One TypeScript file as single source for resources, bindings, migrations, and domains. Diff is reviewable; no manual sync of resource IDs |
| Wrangler in repo | Removed entirely | Keep `wrangler.jsonc` for local dev | Avoids two competing sources of truth. `alchemy dev` emulates locally; the generated `.alchemy/local/wrangler.jsonc` is gitignored |
| Migration application | `D1Database({ migrationsDir })` auto-applies | `wrangler d1 migrations apply` as separate step | Atomic deploy: code + schema move together, rollback via redeploy. D1 lacks `down` migrations either way |
| State store | `CloudflareStateStore` | local fs + git | No state file to keep in sync across machines; no R2 bucket to provision and protect |
| Stage model | `dev / staging / prod` enum | dev/prod only, or unbounded stage names | Reserve `staging` semantically without paying CI cost now; adding the workflow later doesn't touch zod or naming |
| Naming | Hardcoded `opentab-cloud-${stage}-*` | shiprails `brand` abstraction | OpenTab is a single product, not a template. One literal beats indirection |
| OAuth isolation | Per-stage GH OAuth app | Single app with multiple callback URLs | dev secret leakage cannot poison prod; dev environment can be reset / wiped without prod-impact concerns |
| CI structure | `ci.yml` + `deploy.yml` (no overlap) | Defense-in-depth: deploy.yml re-runs lint/typecheck | `ci.yml` already gates main; tags cut from main are by definition gated. Re-running adds latency without catching new failures |
| Secrets injection | GH environment-scoped, same name per env | Suffixed secret names (`X_DEV`, `X_PROD`) | Workflow stays free of stage branching for env values; single `${{ secrets.X }}` resolves correctly via `environment.name` |
| env validation | `packages/config/src/env/*` (4 entrypoints) | `alchemy.secret.env.X` only, ad-hoc per consumer | Worker bundle never pulls `dotenv`; schemas are shared; semantic errors at the boundary instead of "X is required" |

---

## 10. Risks & operator runbook

| Symptom | Cause | Fix |
|---|---|---|
| `alchemy deploy` returns 401 / 403 on first run | CF API token missing scopes | Re-mint with §5.2 scopes; update `CLOUDFLARE_API_TOKEN` secret |
| State unreadable after a deploy attempt | `ALCHEMY_PASSWORD` was changed | Restore the original password. If lost, set `forceUpdate: true` in `alchemy.run.ts` for one deploy to re-adopt — Alchemy re-discovers existing CF resources by name |
| `alchemy deploy` cannot read state at all | `ALCHEMY_STATE_TOKEN` was rotated or revoked | Restore the original token. Same `forceUpdate: true` recovery as above; this is why the token is **never** rotated |
| `WorkersCustomDomain` create fails | `apprails.io` zone not yet on Cloudflare | Add the zone in CF dashboard (no nameserver change needed if using subzone delegation; otherwise update registrar) |
| `prod` deploy refuses to start | `CI=true` not set | Always set in `deploy.yml`. Local emergency deploys: `ALCHEMY_STAGE=prod CI=true pnpm --filter @opentab/cloud deploy` |
| New developer can't run `pnpm dev` | Missing or incomplete `.env` | `cp apps/cloud/.env.example apps/cloud/.env` and fill values; zod prints which keys failed |
| `pnpm build` fails on CI before any deploy | `cloudflare:*` specifiers unresolved | The vite.config gating in §4.2 must register them as SSR builtins when the Alchemy plugin is absent |
| `alchemy destroy` run by accident | No CI guard intercepts it | None — `destroy` is operator-only; document explicitly in `apps/cloud/README.md` and never add a workflow that invokes it |
| D1 schema needs a "down" | D1 has no down migration support | Author a forward-only compensating migration. There is no rollback path other than redeploying the prior worker version (data changes are not reversed) |

---

## 11. Impact on the product spec

`2026-04-24-apps-cloud-design.md` is unaffected at the product / behavior
level:

- §0.4 #11 (D1 + KV, no R2 / DO / Queues) — unchanged.
- §0.4 #5 (BetterAuth: email/password + GitHub OAuth + admin) —
  unchanged. This spec only changes how those env values reach the
  Worker.
- §1 (Phase 0 cleanup + scaffold migration) — Phase 0's deploy step now
  uses `alchemy deploy` instead of `wrangler deploy`. The acceptance
  criterion ("`apps/cloud` deployed to a Cloudflare staging environment")
  becomes "`apps/cloud` deployed to the `dev` stage at
  `opentab-dev.apprails.io`".

A single new row should be appended to the product spec's §0.4 decision
snapshot, cross-linking here. Use the next available row number (the
existing snapshot ends at #32):

```
| 33 | Deployment toolchain | Alchemy IaC; one `alchemy.run.ts` is the source of truth for CF resources. See `2026-04-24-apps-cloud-deployment-alchemy-design.md` |
```

The plan implementing this spec also updates the original spec inline at
that row.
