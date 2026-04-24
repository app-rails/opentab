import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSyncAuth,
  getSyncAuth,
  type SyncAuthState,
  setSyncAuth,
} from "@/lib/sync-auth-storage";

type StorageRecord = Record<string, unknown>;

function installChromeStorageMock(initial: StorageRecord = {}): {
  store: StorageRecord;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  const store: StorageRecord = { ...initial };
  const get = vi.fn(async (key: string) => {
    return key in store ? { [key]: store[key] } : {};
  });
  const set = vi.fn(async (entries: StorageRecord) => {
    Object.assign(store, entries);
  });
  const remove = vi.fn(async (key: string) => {
    delete store[key];
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: { get, set, remove },
    },
  });
  return { store, get, set, remove };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sync-auth-storage", () => {
  it("returns disabled when no state is persisted", async () => {
    installChromeStorageMock();
    const state = await getSyncAuth();
    expect(state).toEqual({ kind: "disabled" });
  });

  it("round-trips a configured state through set/get", async () => {
    const { store } = installChromeStorageMock();
    await setSyncAuth({ kind: "configured", host: "https://sync.example.com" });
    expect(store.opentab_sync_auth_v1).toEqual({
      kind: "configured",
      host: "https://sync.example.com",
    });
    const read = await getSyncAuth();
    expect(read).toEqual({ kind: "configured", host: "https://sync.example.com" });
  });

  it("round-trips an authenticated state with every field intact", async () => {
    installChromeStorageMock();
    const original: SyncAuthState = {
      kind: "authenticated",
      host: "https://sync.example.com",
      deviceId: "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc",
      deviceToken: "tok_abcdef",
      deviceName: "Chrome on MBP",
    };
    await setSyncAuth(original);
    const read = await getSyncAuth();
    expect(read).toEqual(original);
  });

  it("clearSyncAuth wipes persisted state back to disabled", async () => {
    const { store } = installChromeStorageMock();
    await setSyncAuth({ kind: "configured", host: "https://x" });
    expect(store.opentab_sync_auth_v1).toBeDefined();

    await clearSyncAuth();
    expect(store.opentab_sync_auth_v1).toBeUndefined();
    const read = await getSyncAuth();
    expect(read).toEqual({ kind: "disabled" });
  });

  it("treats a malformed kind as disabled", async () => {
    installChromeStorageMock({ opentab_sync_auth_v1: { kind: "bogus", host: "x" } });
    const state = await getSyncAuth();
    expect(state).toEqual({ kind: "disabled" });
  });

  it("treats authenticated state missing required fields as disabled", async () => {
    installChromeStorageMock({
      opentab_sync_auth_v1: {
        kind: "authenticated",
        host: "https://x",
        // missing deviceId / deviceToken / deviceName
      },
    });
    const state = await getSyncAuth();
    expect(state).toEqual({ kind: "disabled" });
  });

  it("treats non-object stored payload as disabled", async () => {
    installChromeStorageMock({ opentab_sync_auth_v1: "not-an-object" });
    const state = await getSyncAuth();
    expect(state).toEqual({ kind: "disabled" });
  });
});
