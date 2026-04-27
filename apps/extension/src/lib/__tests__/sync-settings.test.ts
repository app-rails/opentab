import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYNC_AUTH_STORAGE_KEY } from "@/lib/sync-auth-storage";
import {
  clearSyncSettings,
  getSyncSettings,
  SYNC_SETTINGS_STORAGE_KEY,
  type SyncSettings,
  setSyncSettings,
} from "@/lib/sync-settings";
import { installChromeStorageMock } from "@/test/chrome-storage-mock";

let mock: ReturnType<typeof installChromeStorageMock>;

beforeEach(() => {
  mock = installChromeStorageMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SyncSettings", () => {
  it("returns the default settings when storage is empty", async () => {
    const settings = await getSyncSettings();
    expect(settings).toEqual({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    });
  });

  it("round-trips the value via setSyncSettings + getSyncSettings", async () => {
    const next: SyncSettings = {
      enabled: true,
      savedConfig: { host: "https://sync.example.com", lastUsedAt: 1_700_000_000_000 },
      auth: {
        deviceToken: "tok_abcdef",
        deviceId: "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc",
        deviceName: "Chrome on MBP",
        user: { id: "user_1", name: "Liang", email: "liang@example.com" },
        issuedAt: 1_700_000_000_000,
      },
      hostHistory: [
        { host: "https://sync.example.com", lastUsedAt: 1_700_000_000_000 },
        { host: "https://old.example.com", lastUsedAt: 1_600_000_000_000 },
      ],
    };

    await setSyncSettings(next);
    expect(mock.store[SYNC_SETTINGS_STORAGE_KEY]).toEqual(next);

    const read = await getSyncSettings();
    expect(read).toEqual(next);
  });

  it("merges partial updates against the existing value", async () => {
    await setSyncSettings({ enabled: true });
    await setSyncSettings({
      savedConfig: { host: "https://sync.example.com", lastUsedAt: 42 },
    });

    const read = await getSyncSettings();
    expect(read).toEqual({
      enabled: true,
      savedConfig: { host: "https://sync.example.com", lastUsedAt: 42 },
      auth: null,
      hostHistory: [],
    });
  });

  it("allows auth.user to be omitted (optional)", async () => {
    await setSyncSettings({
      enabled: true,
      auth: {
        deviceToken: "tok",
        deviceId: "dev",
        deviceName: "Chrome",
        issuedAt: 1,
      },
    });

    const read = await getSyncSettings();
    expect(read.auth).toEqual({
      deviceToken: "tok",
      deviceId: "dev",
      deviceName: "Chrome",
      issuedAt: 1,
    });
    expect(read.auth?.user).toBeUndefined();
  });

  it("returns defaults when persisted payload is malformed", async () => {
    mock.store[SYNC_SETTINGS_STORAGE_KEY] = {
      enabled: "yes",
      auth: 42,
      hostHistory: "oops",
    };

    const read = await getSyncSettings();
    expect(read).toEqual({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    });
  });

  it("salvages valid fields and discards garbage from a partially malformed payload", async () => {
    mock.store[SYNC_SETTINGS_STORAGE_KEY] = {
      enabled: true,
      auth: {
        deviceToken: "x",
        deviceId: "y",
        issuedAt: 1,
        garbageExtra: "z",
      },
      savedConfig: "wrong",
      hostHistory: [
        { host: "https://ok.example.com", lastUsedAt: 5 },
        { host: 7, lastUsedAt: 8 },
        "not-an-entry",
      ],
    };

    const read = await getSyncSettings();
    expect(read).toEqual({
      enabled: true,
      savedConfig: null,
      auth: { deviceToken: "x", deviceId: "y", issuedAt: 1 },
      hostHistory: [{ host: "https://ok.example.com", lastUsedAt: 5 }],
    });
  });

  it("clearSyncSettings wipes the persisted value back to defaults", async () => {
    await setSyncSettings({ enabled: true });
    expect(mock.store[SYNC_SETTINGS_STORAGE_KEY]).toBeDefined();

    await clearSyncSettings();
    expect(mock.store[SYNC_SETTINGS_STORAGE_KEY]).toBeUndefined();

    const read = await getSyncSettings();
    expect(read).toEqual({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    });
  });
});

describe("SyncSettings migration v1 -> v2", () => {
  const FIXED_NOW = 1_745_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("migrates v1 disabled -> v2 default and removes the old key", async () => {
    mock.store[SYNC_AUTH_STORAGE_KEY] = { kind: "disabled" };

    const read = await getSyncSettings();

    expect(read).toEqual({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    });
    expect(mock.store[SYNC_AUTH_STORAGE_KEY]).toBeUndefined();
    expect(mock.store[SYNC_SETTINGS_STORAGE_KEY]).toEqual({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    });
  });

  it("migrates v1 configured -> v2 enabled with savedConfig + hostHistory", async () => {
    mock.store[SYNC_AUTH_STORAGE_KEY] = {
      kind: "configured",
      host: "https://sync.example.com",
    };

    const read = await getSyncSettings();

    expect(read).toEqual({
      enabled: true,
      savedConfig: { host: "https://sync.example.com", lastUsedAt: FIXED_NOW },
      auth: null,
      hostHistory: [{ host: "https://sync.example.com", lastUsedAt: FIXED_NOW }],
    });
    expect(mock.store[SYNC_AUTH_STORAGE_KEY]).toBeUndefined();
    expect(mock.store[SYNC_SETTINGS_STORAGE_KEY]).toEqual(read);
  });

  it("migrates v1 authenticated -> v2 enabled with auth (deviceName preserved, user undefined)", async () => {
    mock.store[SYNC_AUTH_STORAGE_KEY] = {
      kind: "authenticated",
      host: "https://sync.example.com",
      deviceId: "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc",
      deviceToken: "tok_abcdef",
      deviceName: "Chrome on MBP",
    };

    const read = await getSyncSettings();

    expect(read).toEqual({
      enabled: true,
      savedConfig: { host: "https://sync.example.com", lastUsedAt: FIXED_NOW },
      auth: {
        deviceToken: "tok_abcdef",
        deviceId: "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc",
        deviceName: "Chrome on MBP",
        issuedAt: FIXED_NOW,
      },
      hostHistory: [{ host: "https://sync.example.com", lastUsedAt: FIXED_NOW }],
    });
    expect(read.auth?.user).toBeUndefined();
    expect(mock.store[SYNC_AUTH_STORAGE_KEY]).toBeUndefined();
    expect(mock.store[SYNC_SETTINGS_STORAGE_KEY]).toEqual(read);
  });

  it("falls back to defaults and removes the old key when the v1 payload is malformed / unknown kind", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Include a realistic-looking deviceToken to prove it never reaches the log.
    const SECRET_TOKEN = "tok_super_secret_abcdef0123456789";
    mock.store[SYNC_AUTH_STORAGE_KEY] = {
      kind: "totally-bogus",
      host: "https://sync.example.com",
      deviceId: "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc",
      deviceToken: SECRET_TOKEN,
      junk: true,
    };

    const read = await getSyncSettings();

    expect(read).toEqual({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    });
    expect(mock.store[SYNC_AUTH_STORAGE_KEY]).toBeUndefined();
    expect(mock.store[SYNC_SETTINGS_STORAGE_KEY]).toEqual(read);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Privacy guarantee: the token must never appear in the logged args.
    const loggedArgs = warnSpy.mock.calls[0];
    const serialized = JSON.stringify(loggedArgs);
    expect(serialized).not.toContain(SECRET_TOKEN);
    expect(serialized).not.toContain("018f3b1e-9f4b-7aaa-8bbb-cccccccccccc");
    expect(serialized).not.toContain("https://sync.example.com");

    // The redacted summary should still convey shape info for debugging.
    expect(loggedArgs[1]).toEqual({
      kind: "totally-bogus",
      hasHost: true,
      hasDeviceId: true,
      hasDeviceToken: true,
    });

    warnSpy.mockRestore();
  });

  it("is idempotent: a second getSyncSettings call reads from the migrated key", async () => {
    mock.store[SYNC_AUTH_STORAGE_KEY] = {
      kind: "configured",
      host: "https://sync.example.com",
    };

    await getSyncSettings();
    expect(mock.store[SYNC_AUTH_STORAGE_KEY]).toBeUndefined();

    // Tamper with the migrated row to prove the second call reads it (not re-migrates).
    (mock.store[SYNC_SETTINGS_STORAGE_KEY] as SyncSettings).enabled = false;

    const read = await getSyncSettings();
    expect(read.enabled).toBe(false);
  });
});
