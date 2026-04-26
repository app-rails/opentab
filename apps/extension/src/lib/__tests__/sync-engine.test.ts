/**
 * Sync-engine unit tests — focused on push-result bucket handling.
 *
 * We spin up an in-memory outbox shim rather than a real Dexie instance so the
 * tests stay fast and deterministic. The shim implements only the subset of
 * Dexie surface that `SyncEngine.push()` actually touches:
 * `where(compoundKey).between(...)` range scans and `where("id").anyOf(...).modify(...)`.
 */
import { SyncErrorCode } from "@opentab/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted, so we stash the in-memory state on
// globalThis to sidestep TDZ issues with top-level `let` bindings.
// ---------------------------------------------------------------------------

type OutboxRow = {
  id: number;
  opId: string;
  entityType: "workspace" | "collection" | "tab";
  entitySyncId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  status: "pending" | "synced" | "failed" | "dead";
  attemptCount: number;
  lastError: string | null;
  nextRetryAt: number | null;
  createdAt: number;
  syncedAt: number | null;
};

type TestState = { outbox: OutboxRow[]; meta: Map<string, unknown> };

declare global {
  // eslint-disable-next-line no-var
  var __syncEngineTestState: TestState | undefined;
}

vi.mock("@/lib/db", () => {
  const state: TestState = { outbox: [], meta: new Map() };
  globalThis.__syncEngineTestState = state;

  const whereCompound = () => ({
    between(a: unknown[]) {
      const [statusA] = a as [string, unknown];
      let limitN = Number.POSITIVE_INFINITY;
      const filter = (row: OutboxRow) => row.status === statusA;
      const chain = {
        limit(n: number) {
          limitN = n;
          return chain;
        },
        async toArray() {
          return state.outbox.filter(filter).slice(0, limitN);
        },
        async primaryKeys() {
          return state.outbox.filter(filter).map((r) => r.id);
        },
      };
      return chain;
    },
  });

  const whereById = () => ({
    anyOf(ids: number[]) {
      return {
        async modify(patch: Partial<OutboxRow>) {
          for (const row of state.outbox) {
            if (ids.includes(row.id)) Object.assign(row, patch);
          }
        },
        async toArray() {
          return state.outbox.filter((r) => ids.includes(r.id));
        },
      };
    },
  });

  const whereByOpId = () => ({
    anyOf(opIds: string[]) {
      return {
        async toArray() {
          return state.outbox.filter((r) => opIds.includes(r.opId));
        },
      };
    },
  });

  const syncOutbox = {
    where(index: string) {
      if (
        index === "[status+createdAt]" ||
        index === "[status+nextRetryAt]" ||
        index === "[status+syncedAt]"
      ) {
        return whereCompound();
      }
      if (index === "id") return whereById();
      if (index === "opId") return whereByOpId();
      throw new Error(`unexpected index: ${index}`);
    },
    async update(id: number, patch: Partial<OutboxRow>) {
      const row = state.outbox.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
    async bulkAdd(rows: OutboxRow[]) {
      for (const r of rows) state.outbox.push({ ...r, id: state.outbox.length + 1 });
    },
    async bulkDelete(ids: number[]) {
      state.outbox = state.outbox.filter((r) => !ids.includes(r.id));
    },
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
      async transaction() {
        throw new Error("transaction not used in these tests");
      },
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

// initialBootstrap walks the active-entity tree via these helpers. Tests
// reassign per-call returns via mockReturnValueOnce (kept here as a default
// "empty world" so the older tests don't have to set them up).
const activeWorkspacesMock = vi.fn(() => ({
  toArray: async () => [] as unknown[],
  count: async () => 0,
}));
const activeCollectionsMock = vi.fn(() => ({ toArray: async () => [] as unknown[] }));
const activeTabsMock = vi.fn(() => ({ toArray: async () => [] as unknown[] }));

vi.mock("@/lib/db-queries", () => ({
  activeWorkspaces: () => activeWorkspacesMock(),
  activeCollections: () => activeCollectionsMock(),
  activeTabs: () => activeTabsMock(),
}));

// Chrome runtime mock for broadcastSyncApplied()
vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    getManifest: () => ({ version: "9.9.9" }),
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { SyncClient, SyncClientError } from "@/lib/sync-client";
import { SyncEngine } from "@/lib/sync-engine";

function getState(): TestState {
  const s = globalThis.__syncEngineTestState;
  if (!s) throw new Error("test state not initialized");
  return s;
}

function seedPendingRow(partial: Partial<OutboxRow>): OutboxRow {
  const state = getState();
  const row: OutboxRow = {
    id: state.outbox.length + 1,
    opId: partial.opId ?? `op-${state.outbox.length + 1}`,
    entityType: partial.entityType ?? "workspace",
    entitySyncId: partial.entitySyncId ?? "sync-1",
    action: partial.action ?? "create",
    payload: partial.payload ?? { syncId: "sync-1" },
    status: partial.status ?? "pending",
    attemptCount: partial.attemptCount ?? 0,
    lastError: partial.lastError ?? null,
    nextRetryAt: partial.nextRetryAt ?? null,
    createdAt: partial.createdAt ?? Date.now(),
    syncedAt: partial.syncedAt ?? null,
  };
  state.outbox.push(row);
  return row;
}

function mockSyncClient(overrides: Partial<Record<keyof SyncClient, unknown>> = {}): SyncClient {
  const defaults = {
    push: vi.fn().mockResolvedValue({
      applied: [],
      duplicates: [],
      lwwSkipped: [],
      error: null,
    }),
    pull: vi.fn().mockResolvedValue({
      changes: [],
      cursor: 0,
      hasMore: false,
      resetRequired: false,
    }),
    snapshot: vi.fn(),
    health: vi.fn(),
    consumeExchange: vi.fn(),
  };
  return Object.assign(Object.create(SyncClient.prototype), { ...defaults, ...overrides });
}

beforeEach(() => {
  const state = getState();
  state.outbox = [];
  state.meta.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  // Keep chrome global stubbed across all tests.
});

// ---------------------------------------------------------------------------
// Push-result bucketing
// ---------------------------------------------------------------------------

describe("SyncEngine.push result bucketing", () => {
  it("marks applied, duplicates, and lwwSkipped ops all as synced", async () => {
    const a = seedPendingRow({ opId: "op-a" });
    const b = seedPendingRow({ opId: "op-b" });
    const c = seedPendingRow({ opId: "op-c" });
    const d = seedPendingRow({ opId: "op-d" });

    const push = vi.fn().mockResolvedValueOnce({
      applied: [a.opId],
      duplicates: [b.opId],
      lwwSkipped: [c.opId, d.opId],
      error: null,
    });
    const client = mockSyncClient({ push });
    const engine = new SyncEngine(client);

    await engine.sync();

    expect(push).toHaveBeenCalledTimes(1);
    for (const row of getState().outbox) {
      expect(row.status).toBe("synced");
      expect(row.syncedAt).not.toBeNull();
    }
  });

  it("marks lwwSkipped ops as synced so they are not retried on the next cycle", async () => {
    const row = seedPendingRow({ opId: "op-lww" });

    const push = vi.fn().mockResolvedValueOnce({
      applied: [],
      duplicates: [],
      lwwSkipped: [row.opId],
      error: null,
    });
    const client = mockSyncClient({ push });
    const engine = new SyncEngine(client);

    await engine.sync();

    const stored = getState().outbox.find((r) => r.id === row.id)!;
    expect(stored.status).toBe("synced");
    expect(stored.attemptCount).toBe(0);
    // No pending rows remain for the next cycle.
    expect(getState().outbox.filter((r) => r.status === "pending")).toHaveLength(0);
  });

  it("keeps the failing op retryable when the server returns an error", async () => {
    const good = seedPendingRow({ opId: "op-good" });
    const bad = seedPendingRow({ opId: "op-bad" });
    const untouched = seedPendingRow({ opId: "op-after" });

    const push = vi.fn().mockResolvedValueOnce({
      applied: [good.opId],
      duplicates: [],
      lwwSkipped: [],
      error: { opId: bad.opId, code: SyncErrorCode.INVALID_PAYLOAD, message: "nope" },
    });
    const client = mockSyncClient({ push });
    const engine = new SyncEngine(client);

    await engine.sync();

    const state = getState();
    const goodRow = state.outbox.find((r) => r.id === good.id)!;
    const badRow = state.outbox.find((r) => r.id === bad.id)!;
    const afterRow = state.outbox.find((r) => r.id === untouched.id)!;

    expect(goodRow.status).toBe("synced");
    expect(badRow.status).toBe("failed");
    expect(badRow.attemptCount).toBe(1);
    expect(badRow.lastError).toContain("INVALID_PAYLOAD");
    // Ops after the failing one remain pending for the next cycle.
    expect(afterRow.status).toBe("pending");
  });

  it("stops gracefully on UNAUTHORIZED without bumping attempt counts", async () => {
    const row = seedPendingRow({ opId: "op-u" });

    const push = vi
      .fn()
      .mockRejectedValueOnce(new SyncClientError(SyncErrorCode.UNAUTHORIZED, 401, "401"));
    const client = mockSyncClient({ push });
    const engine = new SyncEngine(client);

    await engine.sync();

    const stored = getState().outbox.find((r) => r.id === row.id)!;
    expect(stored.status).toBe("pending");
    expect(stored.attemptCount).toBe(0);
  });

  it("stops gracefully on API_VERSION_MISMATCH without bumping attempt counts", async () => {
    const row = seedPendingRow({ opId: "op-v" });

    const push = vi
      .fn()
      .mockRejectedValueOnce(new SyncClientError(SyncErrorCode.API_VERSION_MISMATCH, 426, "426"));
    const client = mockSyncClient({ push });
    const engine = new SyncEngine(client);

    await engine.sync();

    const stored = getState().outbox.find((r) => r.id === row.id)!;
    expect(stored.status).toBe("pending");
    expect(stored.attemptCount).toBe(0);
  });

  it("marks all pending ops as failed on generic network error", async () => {
    const r1 = seedPendingRow({ opId: "op-n1" });
    const r2 = seedPendingRow({ opId: "op-n2" });

    const push = vi.fn().mockRejectedValueOnce(new Error("fetch failed"));
    const client = mockSyncClient({ push });
    const engine = new SyncEngine(client);

    await engine.sync();

    const state = getState();
    const stored1 = state.outbox.find((r) => r.id === r1.id)!;
    const stored2 = state.outbox.find((r) => r.id === r2.id)!;
    expect(stored1.status).toBe("failed");
    expect(stored2.status).toBe("failed");
    expect(stored1.attemptCount).toBe(1);
    expect(stored1.lastError).toContain("fetch failed");
    expect(stored1.nextRetryAt).not.toBeNull();
  });

  it("never escalates to 'dead' on 5xx no matter how many attempts the op has burned", async () => {
    // Server-side 5xx is by definition a server problem and the op is fine;
    // dead = data loss because cleanupOutbox bulkDelete's it after 7 days.
    const row = seedPendingRow({ opId: "op-5xx", attemptCount: 99 });
    const push = vi
      .fn()
      .mockRejectedValueOnce(
        new SyncClientError(SyncErrorCode.INTERNAL, 503, "service unavailable"),
      );
    const engine = new SyncEngine(mockSyncClient({ push }));

    await engine.sync();

    const stored = getState().outbox.find((r) => r.id === row.id)!;
    expect(stored.status).toBe("failed");
    // Crucially: NOT "dead".
    expect(stored.status).not.toBe("dead");
    expect(stored.lastError).toContain("503");
  });

  it("never escalates to 'dead' on a non-429 4xx batch reject either (server contract drift is reportable, not data-discard)", async () => {
    const row = seedPendingRow({ opId: "op-400", attemptCount: 99 });
    const push = vi
      .fn()
      .mockRejectedValueOnce(
        new SyncClientError(SyncErrorCode.INVALID_PAYLOAD, 400, "schema rejected"),
      );
    const engine = new SyncEngine(mockSyncClient({ push }));

    await engine.sync();

    const stored = getState().outbox.find((r) => r.id === row.id)!;
    expect(stored.status).toBe("failed");
    expect(stored.status).not.toBe("dead");
    expect(stored.lastError).toContain("400");
  });

  it("never escalates per-op rejection to 'dead' even after MAX_ATTEMPT_COUNT", async () => {
    const bad = seedPendingRow({ opId: "op-bad", attemptCount: 99 });
    const push = vi.fn().mockResolvedValueOnce({
      applied: [],
      duplicates: [],
      lwwSkipped: [],
      error: { opId: bad.opId, code: SyncErrorCode.SYNC_ID_MISMATCH, message: "mismatch" },
    });
    const engine = new SyncEngine(mockSyncClient({ push }));

    await engine.sync();

    const stored = getState().outbox.find((r) => r.id === bad.id)!;
    expect(stored.status).toBe("failed");
    expect(stored.status).not.toBe("dead");
  });
});

// ---------------------------------------------------------------------------
// Cooldown after 429 — every entry point (alarm, storage listener, manual
// Sync now button, debounced mutate notify) calls engine.sync(); they all
// must respect the same per-user rate-limit floor or we hammer the server.
// ---------------------------------------------------------------------------

describe("SyncEngine cooldown after 429", () => {
  it("sync() returns early while syncMeta.syncCooldownUntil is in the future", async () => {
    const future = Date.now() + 30_000;
    getState().meta.set("syncCooldownUntil", future);

    const client = mockSyncClient();
    const engine = new SyncEngine(client);
    await engine.sync();

    expect(client.push).not.toHaveBeenCalled();
    expect(client.pull).not.toHaveBeenCalled();
  });

  it("sync() proceeds once the cooldown has elapsed", async () => {
    const past = Date.now() - 1;
    getState().meta.set("syncCooldownUntil", past);

    const client = mockSyncClient();
    const engine = new SyncEngine(client);
    await engine.sync();

    expect(client.pull).toHaveBeenCalledTimes(1);
  });

  it("a 429 from push writes syncCooldownUntil = now + Retry-After (sec)", async () => {
    seedPendingRow({ opId: "op-rl" });
    const push = vi.fn().mockRejectedValueOnce(
      Object.assign(new SyncClientError(SyncErrorCode.RATE_LIMITED, 429, "rate limited"), {
        retryAfterSec: 60,
      }),
    );
    const client = mockSyncClient({ push });
    const engine = new SyncEngine(client);
    const before = Date.now();

    await engine.sync();

    const cooldown = getState().meta.get("syncCooldownUntil") as number;
    expect(cooldown).toBeGreaterThanOrEqual(before + 60_000);
    expect(cooldown).toBeLessThan(before + 61_000);
  });

  it("a 429 from pull also writes the cooldown so subsequent sync()s skip", async () => {
    const pull = vi.fn().mockRejectedValueOnce(
      Object.assign(new SyncClientError(SyncErrorCode.RATE_LIMITED, 429, "rate limited"), {
        retryAfterSec: 30,
      }),
    );
    const client = mockSyncClient({ pull });
    const engine = new SyncEngine(client);
    const before = Date.now();

    await engine.sync();

    const cooldown = getState().meta.get("syncCooldownUntil") as number;
    expect(cooldown).toBeGreaterThanOrEqual(before + 30_000);
  });
});

// ---------------------------------------------------------------------------
// initialBootstrap payload contract — server pushOpSchema must accept what
// we generate, otherwise the whole 100-op batch 400's and silently drops
// data on the floor.
// ---------------------------------------------------------------------------

import { type PushOp, pushOpSchema } from "@opentab/protocol";

const WS_ID = "018f1a2b-3c4d-7abc-8def-0123456789a0";
const COL_ID = "018f1a2b-3c4d-7abc-8def-0123456789a1";
const TAB_ID_NO_FAVICON = "018f1a2b-3c4d-7abc-8def-0123456789a2";
const TAB_ID_CHROME_URL = "018f1a2b-3c4d-7abc-8def-0123456789a3";
const TAB_ID_OK = "018f1a2b-3c4d-7abc-8def-0123456789a4";

function workspace(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    accountId: "account-1",
    name: "Personal",
    icon: "folder",
    order: "a0",
    syncId: WS_ID,
    deletedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function collection(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    workspaceId: 1,
    workspaceSyncId: WS_ID,
    name: "Research",
    order: "a0",
    syncId: COL_ID,
    deletedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function tab(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    collectionId: 1,
    collectionSyncId: COL_ID,
    url: "https://example.com/",
    title: "Example",
    favIconUrl: "https://example.com/favicon.ico",
    order: "a0",
    syncId: TAB_ID_OK,
    deletedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function seedEntities({
  workspaces = [],
  collections = [],
  tabs = [],
}: {
  workspaces?: ReturnType<typeof workspace>[];
  collections?: ReturnType<typeof collection>[];
  tabs?: ReturnType<typeof tab>[];
}) {
  activeWorkspacesMock.mockReturnValueOnce({
    toArray: async () => workspaces,
    count: async () => workspaces.length,
  });
  activeCollectionsMock.mockReturnValueOnce({ toArray: async () => collections });
  activeTabsMock.mockReturnValueOnce({ toArray: async () => tabs });
}

function toWireFromOutboxRow(row: OutboxRow): PushOp {
  return {
    kind: `${row.entityType}.${row.action}` as PushOp["kind"],
    opId: row.opId,
    entitySyncId: row.entitySyncId,
    payload: row.payload,
  } as PushOp;
}

describe("SyncEngine.initialBootstrap wire payload validity", () => {
  it("emits a tab.create op with no favIconUrl key when the tab has no favicon (server schema rejects favIconUrl: null)", async () => {
    seedEntities({
      workspaces: [workspace()],
      collections: [collection()],
      tabs: [tab({ syncId: TAB_ID_NO_FAVICON, favIconUrl: undefined })],
    });

    const engine = new SyncEngine(mockSyncClient());
    await engine.initialBootstrap({ force: true });

    const tabRow = getState().outbox.find(
      (r) => r.entityType === "tab" && r.entitySyncId === TAB_ID_NO_FAVICON,
    );
    expect(tabRow).toBeDefined();
    // Schema is the actual contract the server uses on push — assert the
    // generated op parses, otherwise the whole batch 400's at the edge.
    const result = pushOpSchema.safeParse(toWireFromOutboxRow(tabRow!));
    expect(result.success).toBe(true);
    // Defensive: the field must be ABSENT, not present-with-null.
    expect(tabRow!.payload).not.toHaveProperty("favIconUrl");
  });

  it("skips tabs whose URL is not http/https (chrome://, file://, etc.) — they would 400 the batch", async () => {
    seedEntities({
      workspaces: [workspace()],
      collections: [collection()],
      tabs: [
        tab({ syncId: TAB_ID_CHROME_URL, url: "chrome://newtab/" }),
        tab({ syncId: TAB_ID_OK }),
      ],
    });

    const engine = new SyncEngine(mockSyncClient());
    await engine.initialBootstrap({ force: true });

    const tabRows = getState().outbox.filter((r) => r.entityType === "tab");
    expect(tabRows.map((r) => r.entitySyncId)).toEqual([TAB_ID_OK]);
  });

  it("records the skipped count in syncMeta.lastBootstrapSkipped so the UI can surface it", async () => {
    seedEntities({
      workspaces: [workspace()],
      collections: [collection()],
      tabs: [
        tab({ syncId: TAB_ID_CHROME_URL, url: "chrome://newtab/" }),
        tab({ syncId: "018f1a2b-3c4d-7abc-8def-0123456789a5", url: "file:///etc/hosts" }),
        tab({ syncId: TAB_ID_OK }),
      ],
    });

    const engine = new SyncEngine(mockSyncClient());
    await engine.initialBootstrap({ force: true });

    expect(getState().meta.get("lastBootstrapSkipped")).toBe(2);
  });

  it("every generated op (workspace/collection/tab) parses against the wire pushOpSchema", async () => {
    seedEntities({
      workspaces: [workspace()],
      collections: [collection()],
      tabs: [tab(), tab({ syncId: TAB_ID_NO_FAVICON, favIconUrl: undefined })],
    });

    const engine = new SyncEngine(mockSyncClient());
    await engine.initialBootstrap({ force: true });

    for (const row of getState().outbox) {
      const wire = toWireFromOutboxRow(row);
      const result = pushOpSchema.safeParse(wire);
      if (!result.success) {
        throw new Error(
          `op ${row.entityType}.${row.action} failed wire validation: ${result.error.message}`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// initialBootstrap: idempotency vs. wizard-driven force re-run
// ---------------------------------------------------------------------------

describe("SyncEngine.initialBootstrap idempotency", () => {
  it("bails when initialPushCompleted=true so a polling-style sync doesn't redo the bulk push", async () => {
    // Pre-set the marker as if a previous wizard run finished.
    getState().meta.set("initialPushCompleted", true);
    const client = mockSyncClient();
    const engine = new SyncEngine(client);
    const syncSpy = vi.spyOn(engine, "sync");

    await engine.initialBootstrap();

    // Early-return path: never reaches the trailing this.sync() call,
    // and the outbox stays untouched.
    expect(syncSpy).not.toHaveBeenCalled();
    expect(getState().outbox).toHaveLength(0);
  });

  it("bypasses initialPushCompleted when force=true (wizard-driven Upload re-run)", async () => {
    // Reproduces the user-reported regression: a previous wizard run
    // (silenced by the now-removed server_enabled gate) wrote
    // initialPushCompleted=true. Without `force`, the next user-driven
    // `Upload local data` would silently no-op, producing zero requests.
    getState().meta.set("initialPushCompleted", true);
    const client = mockSyncClient();
    const engine = new SyncEngine(client);
    const syncSpy = vi.spyOn(engine, "sync");

    await engine.initialBootstrap({ force: true });

    expect(syncSpy).toHaveBeenCalledTimes(1);
    // Marker is re-set after a forced run, so subsequent non-force calls
    // continue to short-circuit (preserves idempotency for any future
    // poll-driven caller).
    expect(getState().meta.get("initialPushCompleted")).toBe(true);
  });
});
