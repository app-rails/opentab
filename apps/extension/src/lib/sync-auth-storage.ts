/**
 * Phase 1 implementation of sync auth storage (spec §2.4.3).
 *
 * This is the **sync-facing** auth state keyed at `opentab_sync_auth_v1`, and
 * is separate from the offline-only `opentab_auth` key that `auth-storage.ts`
 * still owns. Keeping the two keys disjoint means offline users never have to
 * know the sync server exists.
 *
 * State machine:
 *   - `disabled`      — no sync configured (default).
 *   - `configured`    — user picked a host but hasn't completed the exchange
 *                       handshake yet.
 *   - `authenticated` — exchange succeeded; we have a bearer token and know
 *                       the host+deviceId+deviceName.
 */

export type SyncAuthState =
  | { kind: "disabled" }
  | { kind: "configured"; host: string }
  | {
      kind: "authenticated";
      host: string;
      deviceId: string;
      deviceToken: string;
      deviceName: string;
    };

/**
 * chrome.storage.local key for the sync-auth state. Exported so background
 * + UI can subscribe to `chrome.storage.onChanged` without a magic string in
 * three places.
 */
export const SYNC_AUTH_STORAGE_KEY = "opentab_sync_auth_v1";

const STORAGE_KEY = SYNC_AUTH_STORAGE_KEY;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseSyncAuth(raw: unknown): SyncAuthState {
  if (!raw || typeof raw !== "object") return { kind: "disabled" };
  const candidate = raw as { kind?: unknown } & Record<string, unknown>;

  if (candidate.kind === "disabled") return { kind: "disabled" };

  if (candidate.kind === "configured" && isNonEmptyString(candidate.host)) {
    return { kind: "configured", host: candidate.host };
  }

  if (
    candidate.kind === "authenticated" &&
    isNonEmptyString(candidate.host) &&
    isNonEmptyString(candidate.deviceId) &&
    isNonEmptyString(candidate.deviceToken) &&
    isNonEmptyString(candidate.deviceName)
  ) {
    return {
      kind: "authenticated",
      host: candidate.host,
      deviceId: candidate.deviceId,
      deviceToken: candidate.deviceToken,
      deviceName: candidate.deviceName,
    };
  }

  return { kind: "disabled" };
}

export async function getSyncAuth(): Promise<SyncAuthState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return parseSyncAuth(result[STORAGE_KEY]);
}

export async function setSyncAuth(state: SyncAuthState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function clearSyncAuth(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
