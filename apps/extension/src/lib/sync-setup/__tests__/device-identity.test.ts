import { UUID_V7_REGEX } from "@opentab/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreatePersistedDeviceId } from "@/lib/sync-setup/device-identity";

type StorageRecord = Record<string, unknown>;

function installChromeStorageMock(initial: StorageRecord = {}): {
  store: StorageRecord;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
} {
  const store: StorageRecord = { ...initial };
  const get = vi.fn(async (key: string) => {
    return key in store ? { [key]: store[key] } : {};
  });
  const set = vi.fn(async (entries: StorageRecord) => {
    Object.assign(store, entries);
  });
  vi.stubGlobal("chrome", { storage: { local: { get, set } } });
  return { store, get, set };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getOrCreatePersistedDeviceId", () => {
  it("generates a UUID v7 and persists it on first call", async () => {
    const { store, set } = installChromeStorageMock();

    const id = await getOrCreatePersistedDeviceId();

    expect(id).toMatch(UUID_V7_REGEX);
    expect(set).toHaveBeenCalledWith({ opentab_sync_device_id_v1: id });
    expect(store.opentab_sync_device_id_v1).toBe(id);
  });

  it("returns the stored value on subsequent calls without regenerating", async () => {
    const existing = "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc";
    const { set } = installChromeStorageMock({ opentab_sync_device_id_v1: existing });

    const id = await getOrCreatePersistedDeviceId();

    expect(id).toBe(existing);
    expect(set).not.toHaveBeenCalled();
  });

  it("regenerates when the stored value fails UUID v7 validation", async () => {
    // A classic v4 uuid — fails v7 regex (version nibble is `4`, not `7`).
    const badV4 = "6f3e1b3a-2cfb-4b39-8b9b-ef1b6b1c9f23";
    const { store, set } = installChromeStorageMock({ opentab_sync_device_id_v1: badV4 });

    const id = await getOrCreatePersistedDeviceId();

    expect(id).not.toBe(badV4);
    expect(id).toMatch(UUID_V7_REGEX);
    expect(set).toHaveBeenCalledWith({ opentab_sync_device_id_v1: id });
    expect(store.opentab_sync_device_id_v1).toBe(id);
  });

  it("regenerates when the stored value is not a string", async () => {
    const { set } = installChromeStorageMock({ opentab_sync_device_id_v1: 12345 });

    const id = await getOrCreatePersistedDeviceId();

    expect(id).toMatch(UUID_V7_REGEX);
    expect(set).toHaveBeenCalledTimes(1);
  });
});
