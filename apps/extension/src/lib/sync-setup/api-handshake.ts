import { healthResponseSchema, MIN_SERVER_PROTOCOL_VERSION } from "@opentab/protocol";
import { compareDotted } from "./semver";
import type { HealthCheckResult } from "./types";

/**
 * `GET ${host}/api/health` → decoded `HealthCheckResult` (spec §2.4.5).
 *
 * Three outcomes:
 *   - `ok`              — server reachable and recent enough to talk to.
 *   - `server_too_old`  — server's `protocolVersion` is below the client's
 *                         `MIN_SERVER_PROTOCOL_VERSION`.
 *   - `unreachable`     — network failure, non-2xx, or schema mismatch.
 *
 * Client-too-old is NOT detected here — the server is the authority on what
 * client protocol it accepts, and surfaces it as a 426 on the first sync
 * call. Extension-binary version is out of scope; Chrome Web Store handles
 * that channel.
 */
export async function checkHealth(host: string): Promise<HealthCheckResult> {
  let response: Response;
  try {
    response = await fetch(`${host}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    return { kind: "unreachable", error: err instanceof Error ? err.message : String(err) };
  }

  if (!response.ok) {
    return {
      kind: "unreachable",
      error: `HTTP ${response.status} ${response.statusText}`,
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    return {
      kind: "unreachable",
      error: `Malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const parsed = healthResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { kind: "unreachable", error: `Invalid health response: ${parsed.error.message}` };
  }
  const health = parsed.data;

  if (compareDotted(health.protocolVersion, MIN_SERVER_PROTOCOL_VERSION) < 0) {
    return { kind: "server_too_old", serverProtocol: health.protocolVersion };
  }
  return { kind: "ok", response: health };
}
