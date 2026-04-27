/**
 * SyncEngine.pause/resume — gate sync() on the SyncSettings.enabled toggle
 * without unwiring the engine itself. Outbox writes still flow through
 * mutateWithOutbox; only the network roundtrip is suppressed.
 *
 * The chrome.storage.onChanged listener that flips pause/resume lives in
 * background.ts, so these unit tests can stay pure — no chrome stub
 * required for the engine itself, and no IndexedDB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Minimal in-memory shims — same shape as sync-engine.test.ts but trimmed to
// what sync()'s pause-aware path needs (cooldown read + lastSyncAt write).
// ---------------------------------------------------------------------------

type TestState = { meta: Map<string, unknown> };

declare global {
  // eslint-disable-next-line no-var
  var __syncEnginePauseTestState: TestState | undefined;
}

vi.mock("@/lib/db", () => {
  const state: TestState = { meta: new Map() };
  globalThis.__syncEnginePauseTestState = state;

  const emptyChain = {
    limit() {
      return emptyChain;
    },
    async toArray() {
      return [];
    },
    async primaryKeys() {
      return [];
    },
    anyOf() {
      return {
        async modify() {},
        async toArray() {
          return [];
        },
      };
    },
  };

  const syncOutbox = {
    where() {
      return { between: () => emptyChain, anyOf: emptyChain.anyOf };
    },
    async update() {},
    async bulkAdd() {},
    async bulkDelete() {},
  };

  const syncMeta = {
    async get(key: string) {
      if (!state.meta.has(key)) return undefined;
      return { key, value: state.meta.get(key) };
    },
    async put(entry: { key: string; value: unknown }) {
      state.meta.set(entry.key, entry.value);
    },
    async delete(key: string) {
      state.meta.delete(key);
    },
  };

  return {
    db: {
      syncOutbox,
      syncMeta,
      workspaces: {},
      tabCollections: {},
      collectionTabs: {},
    },
  };
});

vi.mock("@/lib/settings", () => ({
  getSettings: vi.fn(async () => ({
    theme: "system",
    locale: "en",
    welcome_dismissed: false,
    sidebar_collapsed: false,
    right_panel_collapsed: false,
    sync_polling_interval: 60_000,
  })),
}));

vi.mock("@/lib/resolve-account-id", () => ({
  resolveAccountId: vi.fn(async () => "account-1"),
}));

vi.mock("@/lib/sync-settings", () => ({
  setSyncSettings: vi.fn(async () => {}),
}));

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    getManifest: () => ({ version: "9.9.9" }),
  },
});

import { SyncErrorCode } from "@opentab/protocol";
import { SyncClient, SyncClientError } from "@/lib/sync-client";
import { SyncEngine } from "@/lib/sync-engine";
import { setSyncSettings } from "@/lib/sync-settings";

function getState(): TestState {
  const s = globalThis.__syncEnginePauseTestState;
  if (!s) throw new Error("test state not initialized");
  return s;
}

function mockSyncClient(): {
  client: SyncClient;
  push: ReturnType<typeof vi.fn>;
  pull: ReturnType<typeof vi.fn>;
} {
  const push = vi.fn().mockResolvedValue({
    applied: [],
    duplicates: [],
    lwwSkipped: [],
    error: null,
  });
  const pull = vi.fn().mockResolvedValue({
    changes: [],
    cursor: 0,
    hasMore: false,
    resetRequired: false,
  });
  const client = Object.assign(Object.create(SyncClient.prototype), {
    push,
    pull,
    snapshot: vi.fn(),
    health: vi.fn(),
    consumeExchange: vi.fn(),
  }) as SyncClient;
  return { client, push, pull };
}

beforeEach(() => {
  getState().meta.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  // chrome stub stays installed across the file.
});

describe("SyncEngine.pause / resume", () => {
  it("pause() blocks subsequent sync() — neither push nor pull are called", async () => {
    const { client, push, pull } = mockSyncClient();
    const engine = new SyncEngine(client);

    engine.pause();
    await engine.sync();

    expect(push).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
    // Paused sync() must not record lastSyncAt — otherwise the next
    // syncIfNeeded() would skip a real cycle that just resumed.
    expect(getState().meta.has("lastSyncAt")).toBe(false);
  });

  it("resume() restores sync() — pull (and push of an empty batch) run again", async () => {
    const { client, push, pull } = mockSyncClient();
    const engine = new SyncEngine(client);

    engine.pause();
    await engine.sync();
    expect(pull).not.toHaveBeenCalled();

    engine.resume();
    await engine.sync();

    expect(pull).toHaveBeenCalledTimes(1);
    // push() runs against an empty outbox in this shim, so it short-circuits
    // before hitting the client; assert via pull which always fires when
    // sync() proceeds.
    expect(push).toHaveBeenCalledTimes(0); // outbox is empty → push() exits its for-loop without calling client.push
  });

  it("isPaused getter reflects pause/resume state", () => {
    const { client } = mockSyncClient();
    const engine = new SyncEngine(client);

    expect(engine.isPaused).toBe(false);
    engine.pause();
    expect(engine.isPaused).toBe(true);
    engine.resume();
    expect(engine.isPaused).toBe(false);
  });

  it("syncIfNeeded() also short-circuits when paused (no settings read, no DB hit)", async () => {
    // syncIfNeeded() funnels through sync(); the paused flag must gate it
    // from the same chokepoint, otherwise the polling alarm would still
    // fire even after the user disabled sync.
    const { client, push, pull } = mockSyncClient();
    const engine = new SyncEngine(client);

    engine.pause();
    await engine.syncIfNeeded();

    expect(push).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
  });
});

describe("SyncEngine 401/403 handler", () => {
  it("clears SyncSettings.auth when pull() rejects with 401 UNAUTHORIZED", async () => {
    // Defense-in-depth: sync-client.ts already clears auth on its own 401
    // handling, but the engine must do the same for any 401/403 error that
    // bubbles up through the SyncClient layer (e.g. from a future client
    // helper, or a test that bypasses the request() codepath). Without this,
    // a 403 from the server would silently leave auth in place and the user
    // would never see the reauth banner.
    const { client, pull } = mockSyncClient();
    pull.mockRejectedValueOnce(
      new SyncClientError(SyncErrorCode.UNAUTHORIZED, 401, "device token revoked"),
    );
    const engine = new SyncEngine(client);

    await engine.sync();

    expect(setSyncSettings).toHaveBeenCalledWith({ auth: null });
  });

  it("clears SyncSettings.auth when pull() rejects with 403 FORBIDDEN", async () => {
    // 403 is the FORBIDDEN sibling of 401 — same outcome from the user's
    // perspective (the device can no longer authenticate), so the engine
    // treats it identically to keep the reauth flow uniform. Asserted via
    // pull() because the empty-outbox shim short-circuits push() before it
    // ever calls client.push().
    const { client, pull } = mockSyncClient();
    pull.mockRejectedValueOnce(new SyncClientError("FORBIDDEN", 403, "device disabled"));
    const engine = new SyncEngine(client);

    await engine.sync();

    expect(setSyncSettings).toHaveBeenCalledWith({ auth: null });
  });

  it("does NOT clear auth on 429 rate-limit (transient, not an auth issue)", async () => {
    // 429 means the server is throttling, not that auth is invalid. Clearing
    // auth here would force a wizard restart on every rate-limit event,
    // which is the wrong UX.
    const { client, pull } = mockSyncClient();
    pull.mockRejectedValueOnce(
      new SyncClientError(SyncErrorCode.RATE_LIMITED, 429, "rate limited", 60),
    );
    const engine = new SyncEngine(client);

    await engine.sync();

    expect(setSyncSettings).not.toHaveBeenCalled();
  });
});
