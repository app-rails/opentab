import { PROTOCOL_VERSION, type WhoamiResponse, whoamiResponseSchema } from "@opentab/protocol";

/**
 * Result of a one-shot `GET /api/sync/whoami` call.
 *
 * Errors are coarse-grained on purpose: the Settings page only needs to decide
 * between "auth still good", "kick to re-auth", or "transient, leave as-is".
 * Anything more specific belongs in the full `SyncClient`.
 */
export type FetchServerWhoamiResult =
  | { ok: true; whoami: WhoamiResponse }
  | { ok: false; error: "unauthorized" | "network" | "server" };

/**
 * Verify a stored `deviceToken` against `${host}/api/sync/whoami`.
 *
 * Mirrors `fetchServerStats`: one shot, no retries, three error buckets.
 *   - `unauthorized` (401/403) → token expired/revoked, drop auth + reauth
 *   - `network`               → fetch threw (offline, DNS, CORS preflight)
 *   - `server`                → any other non-2xx, or malformed response body
 *
 * Trailing slashes on `host` are normalized so the URL doesn't end up with
 * `//api/sync/whoami`.
 */
export async function fetchServerWhoami(args: {
  host: string;
  deviceToken: string;
}): Promise<FetchServerWhoamiResult> {
  const url = `${args.host.replace(/\/$/, "")}/api/sync/whoami`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${args.deviceToken}`,
        "x-opentab-protocol-version": PROTOCOL_VERSION,
      },
    });
  } catch {
    return { ok: false, error: "network" };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: "unauthorized" };
  }
  if (!response.ok) {
    return { ok: false, error: "server" };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: "server" };
  }

  const parsed = whoamiResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "server" };
  }
  return { ok: true, whoami: parsed.data };
}
