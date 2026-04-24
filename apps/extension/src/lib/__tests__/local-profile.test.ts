import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const first = vi.fn();
  const orderBy = vi.fn(() => ({ first }));
  return {
    db: {
      workspaces: { orderBy },
    },
    __mocks: { orderBy, first },
  };
});

import { db } from "@/lib/db";
import { __resetLocalProfileIdCacheForTests, getLocalProfileId } from "@/lib/local-profile";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StorageRecord = Record<string, unknown>;

function installBrowserMock(initial: StorageRecord = {}): {
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
  vi.stubGlobal("browser", {
    storage: {
      local: { get, set },
    },
  });
  return { store, get, set };
}

function getFirstMock() {
  const wsFirst = vi.mocked(db.workspaces.orderBy("id").first);
  return wsFirst;
}

beforeEach(() => {
  __resetLocalProfileIdCacheForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getLocalProfileId", () => {
  it("adopts localUuid from raw auth-storage payload when present", async () => {
    const authState = {
      mode: "online",
      localUuid: "abc-auth-uuid",
      accountId: "server-account",
      sessionToken: "token",
    };
    const { store, set } = installBrowserMock({ opentab_auth: authState });

    const id = await getLocalProfileId();

    expect(id).toBe("abc-auth-uuid");
    expect(set).toHaveBeenCalledWith({ opentab_local_profile_id_v1: "abc-auth-uuid" });
    expect(store.opentab_local_profile_id_v1).toBe("abc-auth-uuid");
    // Should not have consulted Dexie when auth-storage adoption succeeded.
    expect(vi.mocked(db.workspaces.orderBy)).not.toHaveBeenCalled();
  });

  it("adopts accountId from the oldest workspace when auth-storage is absent", async () => {
    installBrowserMock();
    getFirstMock().mockResolvedValueOnce({
      id: 1,
      accountId: "xyz-ws-uuid",
      name: "First",
      icon: "folder",
      order: "a0",
      syncId: "sync-1",
      createdAt: 1,
      updatedAt: 1,
    });

    const id = await getLocalProfileId();

    expect(id).toBe("xyz-ws-uuid");
    expect(db.workspaces.orderBy).toHaveBeenCalledWith("id");
  });

  it("generates a fresh UUID when both adoption paths yield nothing", async () => {
    const { set, store } = installBrowserMock();
    getFirstMock().mockResolvedValueOnce(undefined);

    const id = await getLocalProfileId();

    expect(id).toMatch(UUID_V4_RE);
    expect(set).toHaveBeenCalledWith({ opentab_local_profile_id_v1: id });
    expect(store.opentab_local_profile_id_v1).toBe(id);
  });

  it("returns the stored id on subsequent calls without re-adopting", async () => {
    installBrowserMock({ opentab_local_profile_id_v1: "stored-id" });

    const first = await getLocalProfileId();
    const second = await getLocalProfileId();

    expect(first).toBe("stored-id");
    expect(second).toBe("stored-id");
    // Second call should hit the in-memory cache: no additional storage reads.
    const getCalls = vi.mocked(browser.storage.local.get).mock.calls.length;
    expect(getCalls).toBe(1);
    // And it must never fall back to auth-storage or Dexie adoption.
    expect(vi.mocked(db.workspaces.orderBy)).not.toHaveBeenCalled();
  });

  it("treats empty-string auth-storage localUuid as missing and falls back to workspace", async () => {
    installBrowserMock({ opentab_auth: { mode: "online", localUuid: "" } });
    getFirstMock().mockResolvedValueOnce({
      id: 1,
      accountId: "ws-fallback",
      name: "First",
      icon: "folder",
      order: "a0",
      syncId: "sync-1",
      createdAt: 1,
      updatedAt: 1,
    });

    const id = await getLocalProfileId();

    expect(id).toBe("ws-fallback");
  });
});
