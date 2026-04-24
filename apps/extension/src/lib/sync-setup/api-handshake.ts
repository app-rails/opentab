import {
  healthResponseSchema,
  MIN_SERVER_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "@opentab/protocol";
import { compareDotted } from "./semver";
import type { HealthCheckResult } from "./types";

/**
 * `GET ${host}/api/health` → decoded `HealthCheckResult` (spec §2.4.5).
 *
 * Precedence intentionally mirrors the spec's decision table:
 *   1. `extension_too_old` — server refuses to talk to us → user must upgrade.
 *   2. `protocol_too_old`  — our PROTOCOL_VERSION is below the server's floor.
 *   3. `server_too_old`    — server's protocolVersion is below our MIN_SERVER.
 *   4. `upgrade_recommended` — soft nudge; flow can continue.
 *   5. `ok`.
 * Network or parse failures collapse into `unreachable` so the UI only has to
 * render one "can't reach server" path.
 */
export async function checkHealth(host: string): Promise<HealthCheckResult> {
  const extensionVersion = chrome.runtime.getManifest().version;

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

  if (compareDotted(extensionVersion, health.minSupportedExtensionVersion) < 0) {
    return { kind: "extension_too_old", minRequired: health.minSupportedExtensionVersion };
  }
  if (compareDotted(PROTOCOL_VERSION, health.minSupportedProtocolVersion) < 0) {
    return { kind: "protocol_too_old", minRequired: health.minSupportedProtocolVersion };
  }
  if (compareDotted(health.protocolVersion, MIN_SERVER_PROTOCOL_VERSION) < 0) {
    return { kind: "server_too_old", serverProtocol: health.protocolVersion };
  }
  if (
    health.recommendedExtensionVersion !== null &&
    compareDotted(health.recommendedExtensionVersion, extensionVersion) > 0
  ) {
    return {
      kind: "upgrade_recommended",
      recommended: health.recommendedExtensionVersion,
      response: health,
    };
  }
  return { kind: "ok", response: health };
}
