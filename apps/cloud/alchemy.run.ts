import { getAlchemyEnv } from "@opentab/config/env/node";
import alchemy from "alchemy";
import { CustomDomain, D1Database, KVNamespace, ReactRouter } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

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
const hostname = env.ALCHEMY_STAGE === "prod" ? "opentab.apprails.io" : "opentab-dev.apprails.io";

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
    APP_ENV: env.ALCHEMY_STAGE === "prod" ? "production" : "development",
    APP_URL: env.APP_URL,
    BETTER_AUTH_SECRET: alchemy.secret.env("BETTER_AUTH_SECRET"),
    BETTER_AUTH_ADMIN_USER_ID: env.BETTER_AUTH_ADMIN_USER_ID,
    CHROMIUM_EXTENSION_IDS: env.CHROMIUM_EXTENSION_IDS ?? "",
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: alchemy.secret.env("GITHUB_CLIENT_SECRET"),
    SESSION_SECRET: alchemy.secret.env("SESSION_SECRET"),
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
