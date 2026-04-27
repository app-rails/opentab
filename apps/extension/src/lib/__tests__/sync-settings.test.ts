import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
