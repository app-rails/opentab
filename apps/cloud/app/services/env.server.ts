import { appName } from "~/lib/config";

/*
 * NOTE:
 * All runtime env vars should come from `cloudflare:workers`.
 * `process.env.NODE_ENV` is used only for build-time compatibility
 * (e.g. `pnpm auth:generate`).
 */

export const isDevelopment = process.env.NODE_ENV === "development";
export const isProduction = process.env.NODE_ENV === "production";

export function getClientEnv() {
  return {
    APP_NAME: appName,
  } as const;
}

/**
 * Extend the Worker Env with optional secrets that `wrangler types` doesn't
 * auto-discover (secrets and unbound vars). Required in production, absent
 * in local dev — consumers must treat it as `string | undefined`.
 *
 * - `CHROMIUM_EXTENSION_IDS`: comma-separated Chrome extension IDs that are
 *   allowed to talk to this server (CORS + callback allowlist). Optional so
 *   `apps/cloud` can still boot in dev without it configured.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      CHROMIUM_EXTENSION_IDS?: string;
    }
  }
}
