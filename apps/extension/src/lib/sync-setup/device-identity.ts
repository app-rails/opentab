import { UUID_V7_REGEX } from "@opentab/protocol";
import { v7 as uuidv7 } from "uuid";

/**
 * Persistent, per-install device identifier.
 *
 * Rationale (spec §2.4.3, Finding 3): the server's exchange handshake uses
 * `deviceId` as the stable key of the audit row for a given device — so a
 * Disconnect followed by a Re-auth must land on the SAME audit row. Rotating
 * the deviceId on every Disconnect would fragment that row and break the
 * "one device = one device record" invariant.
 *
 * Consequences:
 *   - Generated once and persisted to `chrome.storage.local`.
 *   - NOT cleared by `clearSyncAuth()` / Disconnect.
 *   - Cleared only on uninstall/reinstall (storage is wiped by Chrome).
 *
 * Persisted under `opentab_sync_device_id_v1`.
 */
const STORAGE_KEY = "opentab_sync_device_id_v1";

export async function getOrCreatePersistedDeviceId(): Promise<string> {
  const existing = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (typeof existing === "string" && UUID_V7_REGEX.test(existing)) {
    return existing;
  }
  const fresh = uuidv7();
  await chrome.storage.local.set({ [STORAGE_KEY]: fresh });
  return fresh;
}
