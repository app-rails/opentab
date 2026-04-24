// Single source of truth for the extension-origin allowlist.
//
// Both Better Auth (`trustedOrigins`) and the `/connect/extension` exchange
// callback validator consume `getExtensionOrigins()` / `isAllowedCallback()`
// so they cannot drift apart.
//
// Dev mode returns a wildcard so unpacked extensions (with rotating IDs)
// can connect without config. Production parses `CHROMIUM_EXTENSION_IDS`
// (comma-separated) from env and materializes full `chrome-extension://<id>`
// origins.

export type AllowlistEnv = Pick<Env, "APP_ENV"> & { CHROMIUM_EXTENSION_IDS?: string };

export function getExtensionOrigins(env: AllowlistEnv): string[] {
  if (env.APP_ENV === "development") return ["chrome-extension://*"];
  const raw = env.CHROMIUM_EXTENSION_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.map((id) => `chrome-extension://${id}`);
}

/**
 * Check whether a `callback_url` origin is safe to redirect back to during
 * the extension setup exchange. The input is typically a full origin
 * (`chrome-extension://abc123`) or a full URL (`chrome-extension://abc123/setup-callback.html`).
 *
 * In dev, any `chrome-extension://*` origin passes.
 * In prod, the origin must exactly match a configured entry, or the URL
 * must begin with `<origin>/` (path-prefix match).
 */
export function isAllowedCallback(origin: string, env: AllowlistEnv): boolean {
  const origins = getExtensionOrigins(env);
  if (origins.includes("chrome-extension://*")) {
    return origin.startsWith("chrome-extension://");
  }
  return origins.some((o) => origin === o || origin.startsWith(`${o}/`));
}
