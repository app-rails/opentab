// Vitest shim for the `cloudflare:workers` module specifier. The real module
// is only resolvable inside the Workers runtime; in unit tests we just need a
// benign `env` object — tests that need specific env shape provide their own.
export const env = {
  APP_ENV: "test",
  APP_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
  BETTER_AUTH_ADMIN_USER_ID: "",
  APP_KV: undefined,
  DB: undefined,
} as unknown as Record<string, unknown>;
