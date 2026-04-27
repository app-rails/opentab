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
 * The legacy `opentab_sync_auth_v1` row in `sync-auth-storage.ts` will be
 * migrated into this shape by Task 6 of the extension-settings router plan;
 * this module deliberately ships *without* that migration so the storage
 * primitive stays small and easy to test in isolation.
 */

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
  hostHistory: Array<{ host: string; lastUsedAt: number }>;
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

export async function getSyncSettings(): Promise<SyncSettings> {
  const result = await chrome.storage.local.get(SYNC_SETTINGS_STORAGE_KEY);
  return parseSyncSettings(result[SYNC_SETTINGS_STORAGE_KEY]);
}

export async function setSyncSettings(partial: Partial<SyncSettings>): Promise<void> {
  const current = await getSyncSettings();
  const next: SyncSettings = { ...current, ...partial };
  await chrome.storage.local.set({ [SYNC_SETTINGS_STORAGE_KEY]: next });
}

export async function clearSyncSettings(): Promise<void> {
  await chrome.storage.local.remove(SYNC_SETTINGS_STORAGE_KEY);
}
