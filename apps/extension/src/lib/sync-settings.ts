/**
 * SyncSettings storage (spec §3.0).
 *
 * Single chrome.storage.local row that owns the user-facing sync extension
 * settings: the on/off toggle, the host the user picked, the device-bound auth
 * token, and a small recently-used host history. Default value is the
 * "disabled, never configured" shape so first-run users land on the offline
 * experience.
 *
 * Key naming: this file owns `opentab_sync_settings_v1` (note the `_v1`).
 * The legacy `opentab_sync_auth_v1` row in `sync-auth-storage.ts` is migrated
 * lazily by `migrateFromV1` below the first time `getSyncSettings()` runs and
 * the new key is absent. The migration is a one-shot: it writes the new key
 * and removes the old one, so subsequent calls hit the fast path.
 */

export interface HostEntry {
  host: string;
  lastUsedAt: number;
}

export interface SyncSettings {
  enabled: boolean;
  savedConfig: { host: string; lastUsedAt: number } | null;
  auth: {
    deviceToken: string;
    deviceId: string;
    deviceName?: string;
    user?: { id: string; name: string; email?: string };
    issuedAt: number;
  } | null;
  hostHistory: HostEntry[];
}

export const SYNC_SETTINGS_STORAGE_KEY = "opentab_sync_settings_v1";

const DEFAULT_SETTINGS: SyncSettings = {
  enabled: false,
  savedConfig: null,
  auth: null,
  hostHistory: [],
};

function defaults(): SyncSettings {
  return { ...DEFAULT_SETTINGS, hostHistory: [] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSavedConfig(raw: unknown): SyncSettings["savedConfig"] {
  if (!isObject(raw)) return null;
  if (typeof raw.host !== "string" || typeof raw.lastUsedAt !== "number") return null;
  return { host: raw.host, lastUsedAt: raw.lastUsedAt };
}

function parseAuth(raw: unknown): SyncSettings["auth"] {
  if (!isObject(raw)) return null;
  if (
    typeof raw.deviceToken !== "string" ||
    typeof raw.deviceId !== "string" ||
    typeof raw.issuedAt !== "number"
  ) {
    return null;
  }
  const auth: NonNullable<SyncSettings["auth"]> = {
    deviceToken: raw.deviceToken,
    deviceId: raw.deviceId,
    issuedAt: raw.issuedAt,
  };
  if (typeof raw.deviceName === "string") auth.deviceName = raw.deviceName;
  if (isObject(raw.user) && typeof raw.user.id === "string" && typeof raw.user.name === "string") {
    const user: NonNullable<NonNullable<SyncSettings["auth"]>["user"]> = {
      id: raw.user.id,
      name: raw.user.name,
    };
    if (typeof raw.user.email === "string") user.email = raw.user.email;
    auth.user = user;
  }
  return auth;
}

function parseHostHistory(raw: unknown): SyncSettings["hostHistory"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isObject(entry)) return [];
    if (typeof entry.host !== "string" || typeof entry.lastUsedAt !== "number") return [];
    return [{ host: entry.host, lastUsedAt: entry.lastUsedAt }];
  });
}

function parseSyncSettings(raw: unknown): SyncSettings {
  if (!isObject(raw)) return defaults();
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : false,
    savedConfig: parseSavedConfig(raw.savedConfig),
    auth: parseAuth(raw.auth),
    hostHistory: parseHostHistory(raw.hostHistory),
  };
}

/**
 * One-shot migration from the legacy `opentab_sync_auth_v1` row written by
 * `sync-auth-storage.ts`. We deliberately don't import the old `SyncAuthState`
 * type here so that file can be deleted later without touching this one.
 *
 * Mapping rules (spec §3.0):
 *   { kind: "disabled" }                                  -> defaults()
 *   { kind: "configured", host }                          -> enabled + savedConfig + hostHistory
 *   { kind: "authenticated", host, deviceId, deviceToken,
 *     deviceName }                                        -> + auth (user undefined, filled by whoami later)
 *   anything else (unknown kind, non-object payload)      -> defaults() + console.warn
 *
 * Returns the migrated settings on success, or `null` if the old key was
 * absent (caller should then return defaults without writing).
 */
const LEGACY_SYNC_AUTH_KEY = "opentab_sync_auth_v1";

async function migrateFromV1(): Promise<SyncSettings | null> {
  const legacy = await chrome.storage.local.get(LEGACY_SYNC_AUTH_KEY);
  if (!(LEGACY_SYNC_AUTH_KEY in legacy)) return null;

  const raw = legacy[LEGACY_SYNC_AUTH_KEY];
  const now = Date.now();
  let migrated: SyncSettings;

  if (isObject(raw) && raw.kind === "disabled") {
    migrated = defaults();
  } else if (
    isObject(raw) &&
    raw.kind === "configured" &&
    typeof raw.host === "string" &&
    raw.host.length > 0
  ) {
    migrated = {
      enabled: true,
      savedConfig: { host: raw.host, lastUsedAt: now },
      auth: null,
      hostHistory: [{ host: raw.host, lastUsedAt: now }],
    };
  } else if (
    isObject(raw) &&
    raw.kind === "authenticated" &&
    typeof raw.host === "string" &&
    raw.host.length > 0 &&
    typeof raw.deviceId === "string" &&
    typeof raw.deviceToken === "string" &&
    typeof raw.deviceName === "string"
  ) {
    migrated = {
      enabled: true,
      savedConfig: { host: raw.host, lastUsedAt: now },
      auth: {
        deviceToken: raw.deviceToken,
        deviceId: raw.deviceId,
        deviceName: raw.deviceName,
        issuedAt: now,
      },
      hostHistory: [{ host: raw.host, lastUsedAt: now }],
    };
  } else {
    // Redact the payload before logging: it may contain a deviceToken if only
    // some authenticated fields were valid. Only emit shape info, never values.
    console.warn("[sync-settings] migrateFromV1: unrecognized legacy payload, resetting", {
      kind: isObject(raw) ? raw.kind : typeof raw,
      hasHost: isObject(raw) && typeof raw.host === "string",
      hasDeviceId: isObject(raw) && typeof raw.deviceId === "string",
      hasDeviceToken: isObject(raw) && typeof raw.deviceToken === "string",
    });
    migrated = defaults();
  }

  await chrome.storage.local.set({ [SYNC_SETTINGS_STORAGE_KEY]: migrated });
  await chrome.storage.local.remove(LEGACY_SYNC_AUTH_KEY);
  return migrated;
}

export async function getSyncSettings(): Promise<SyncSettings> {
  const result = await chrome.storage.local.get(SYNC_SETTINGS_STORAGE_KEY);
  if (SYNC_SETTINGS_STORAGE_KEY in result) {
    return parseSyncSettings(result[SYNC_SETTINGS_STORAGE_KEY]);
  }

  const migrated = await migrateFromV1();
  if (migrated) return migrated;

  return defaults();
}

export async function setSyncSettings(partial: Partial<SyncSettings>): Promise<void> {
  const current = await getSyncSettings();
  const next: SyncSettings = { ...current, ...partial };
  await chrome.storage.local.set({ [SYNC_SETTINGS_STORAGE_KEY]: next });
}

export async function clearSyncSettings(): Promise<void> {
  await chrome.storage.local.remove(SYNC_SETTINGS_STORAGE_KEY);
}
