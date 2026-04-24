import { db } from "./db";

/**
 * Storage key for the stable local profile id (per spec decision 23).
 *
 * The profile id is the identity a user's offline-first data is associated with
 * on this device. It is distinct from any server-side account id; the server
 * maps one or more server accounts onto a local profile rather than the other
 * way around.
 */
const STORAGE_KEY = "opentab_local_profile_id_v1";

/**
 * Legacy auth-storage key. We read it **raw** (not via `getAuthState()`) so the
 * adoption logic works even for historical `{ mode: "online", localUuid, ... }`
 * payloads that the trimmed `AuthState` type no longer describes. Historical
 * online-mode storage still carries a real `localUuid` string at runtime — that
 * is the value we want to salvage here.
 */
const LEGACY_AUTH_KEY = "opentab_auth";

type RawAuthStorage = {
  localUuid?: unknown;
};

let cached: string | null = null;

async function readStoredProfileId(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const value = result[STORAGE_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function writeStoredProfileId(id: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: id });
}

async function adoptFromAuthStorage(): Promise<string | null> {
  const result = await browser.storage.local.get(LEGACY_AUTH_KEY);
  const raw = result[LEGACY_AUTH_KEY] as RawAuthStorage | undefined;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw.localUuid;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

async function adoptFromOldestWorkspace(): Promise<string | null> {
  const first = await db.workspaces.orderBy("id").first();
  if (!first) return null;
  const candidate = first.accountId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/**
 * Resolve the stable local profile id.
 *
 * On the first call with no stored value, we attempt to adopt an id from:
 *   1. The legacy `opentab_auth` storage payload's `localUuid` field.
 *   2. The oldest persisted workspace's `accountId`.
 *
 * Only if both adoption paths yield nothing do we fall back to generating a
 * fresh id via `crypto.randomUUID()`. (Task 31 will later migrate fresh ids to
 * UUID v7; `crypto.randomUUID()` generates v4, which is acceptable as a
 * bootstrap fallback until that migration lands.)
 *
 * The resolved id is persisted back to `chrome.storage.local` under
 * `opentab_local_profile_id_v1` and cached in module memory so subsequent
 * calls avoid repeated async lookups.
 */
export async function getLocalProfileId(): Promise<string> {
  if (cached) return cached;

  const stored = await readStoredProfileId();
  if (stored) {
    cached = stored;
    return stored;
  }

  const adopted = (await adoptFromAuthStorage()) ?? (await adoptFromOldestWorkspace());
  const id = adopted ?? crypto.randomUUID();

  await writeStoredProfileId(id);
  cached = id;
  return id;
}

/**
 * Reset the in-memory cache. Test-only; not exported via the index barrel.
 */
export function __resetLocalProfileIdCacheForTests(): void {
  cached = null;
}
