import { PROTOCOL_VERSION, type StatsResponse, statsResponseSchema } from "@opentab/protocol";

/**
 * Result of a one-shot `GET /api/sync/stats` call.
 *
 * Errors are coarse-grained on purpose: the Settings overview only needs to
 * decide between "show counts", "re-auth", or "show retry/network message".
 * Anything more specific belongs in the full `SyncClient`.
 */
export type FetchServerStatsResult =
  | { ok: true; stats: StatsResponse }
  | { ok: false; error: "unauthorized" | "network" | "server" };

/**
 * Fetch the user's server-side stats (`workspaces`, `collections`, `tabs`).
 *
 * One shot, no retries. Failures collapse to three buckets so the caller can
 * react without parsing HTTP semantics:
 *   - `unauthorized` (401/403) → device token expired, kick to re-auth
 *   - `network`               → fetch threw (offline, DNS, CORS preflight)
 *   - `server`                → any other non-2xx, or malformed response body
 *
 * Trailing slashes on `host` are normalized so the URL doesn't end up with
 * `//api/sync/stats`.
 */
export async function fetchServerStats(args: {
  host: string;
  deviceToken: string;
}): Promise<FetchServerStatsResult> {
  const url = `${args.host.replace(/\/$/, "")}/api/sync/stats`;
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

  const parsed = statsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "server" };
  }
  return { ok: true, stats: parsed.data };
}
