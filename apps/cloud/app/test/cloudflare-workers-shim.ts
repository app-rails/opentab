// Vitest shim for the `cloudflare:workers` module specifier. The real module
// is only resolvable inside the Workers runtime; in unit tests we just need a
// benign `env` object — tests that need specific env shape provide their own.
//
// Values must satisfy WorkerEnvSchema (packages/config/src/env/schemas.ts):
// auth.server.ts calls `parseWorkerEnv(env)` at module load, so any test that
// transitively imports auth.server.ts pays this validation cost.
export const env = {
  APP_ENV: "test",
  APP_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
  SESSION_SECRET: "y".repeat(32),
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: "test-client-secret",
  BETTER_AUTH_ADMIN_USER_ID: "",
  CHROMIUM_EXTENSION_IDS: "",
  APP_KV: undefined,
  DB: undefined,
} as unknown as Record<string, unknown>;
