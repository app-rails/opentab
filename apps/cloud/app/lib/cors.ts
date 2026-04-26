// CORS for /api/* requests coming from the Chrome extension.
//
// The extension lives at chrome-extension://<id> and calls the worker via
// fetch (different origin from the worker's APP_URL). Without explicit CORS
// headers the browser refuses to expose the response — that surfaces as the
// classic "No 'Access-Control-Allow-Origin' header is present" error.
//
// Trust list is shared with BetterAuth's `trustedOrigins` via
// `getExtensionOrigins(env)` so the two cannot drift. Dev mode allows any
// chrome-extension://* origin; prod restricts to the IDs configured in
// `CHROMIUM_EXTENSION_IDS`.
//
// Same-origin requests (the worker's own pages calling /api/*) hit this code
// too but `origin` is null on same-origin fetches, so they short-circuit to
// `null` headers and stay untouched.

import { type AllowlistEnv, getExtensionOrigins } from "./allowlist-origins";

const ALLOWED_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "x-opentab-protocol-version",
].join(", ");

const ALLOWED_METHODS = "GET, POST, OPTIONS";

export function isAllowedExtensionOrigin(origin: string, env: AllowlistEnv): boolean {
  const origins = getExtensionOrigins(env);
  if (origins.includes("chrome-extension://*")) {
    return origin.startsWith("chrome-extension://");
  }
  return origins.includes(origin);
}

/**
 * Build the CORS response headers for a request.
 *
 * Returns null when:
 *   - `origin` is null (same-origin request — no CORS needed),
 *   - `origin` is not in the trust list (untrusted cross-origin — let the
 *     browser block it; do not echo back an Access-Control-Allow-Origin).
 */
export function corsHeadersFor(
  origin: string | null,
  env: AllowlistEnv,
): Record<string, string> | null {
  if (!origin) return null;
  if (!isAllowedExtensionOrigin(origin, env)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
  };
}
