/**
 * Tests for `sync-log-loader.ts` — the pure async loader behind the settings
 * sync-log table (spec §3.1, §5.1).
 *
 * The loader's job is to take a page of `syncOutbox` rows and decorate each
 * one with the parent workspace/collection names so the UI can show
 * "Workspace > Collection > Tab" without an N+1 lookup per row. The lookups
 * MUST be batched: at most one query against `db.workspaces` and one against
 * `db.tabCollections` per page, regardless of how many rows reference them.
 *
 * We mock `@/lib/db` with an in-memory shim (same pattern used by
 * `sync-engine.test.ts` / `mutate-with-outbox.test.ts`) so the test stays
 * fast and deterministic without pulling in `fake-indexeddb`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

type WorkspaceRow = { id: number; syncId: string; name: string };
type CollectionRow = {
  id: number;
  syncId: string;
  name: string;
  workspaceSyncId?: string;
};

type TestState = {
  outbox: OutboxRow[];
  workspaces: WorkspaceRow[];
  collections: CollectionRow[];
};

declare global {
  // eslint-disable-next-line no-var
  var __syncLogLoaderTestState: TestState | undefined;
}

vi.mock("@/lib/db", () => {
  const state: TestState = { outbox: [], workspaces: [], collections: [] };
  globalThis.__syncLogLoaderTestState = state;

  // syncOutbox supports two read paths (spec §5.1):
  //   filter='all'  → orderBy('id').reverse().offset(N).limit(N).toArray()
  //   filter!='all' → where('[status+createdAt]').between([f,min],[f,max])
  //                     .reverse().offset(N).limit(N).toArray()
  const outboxOrderBy = (key: string) => {
    if (key !== "id") throw new Error(`unexpected orderBy key: ${key}`);
    let reversed = false;
    let offsetN = 0;
    let limitN = Number.POSITIVE_INFINITY;
    const chain = {
      reverse() {
        reversed = !reversed;
        return chain;
      },
      offset(n: number) {
        offsetN = n;
        return chain;
      },
      limit(n: number) {
        limitN = n;
        return chain;
      },
      async toArray() {
        const sorted = [...state.outbox].sort((a, b) => (reversed ? b.id - a.id : a.id - b.id));
        return sorted.slice(offsetN, offsetN + limitN);
      },
    };
    return chain;
  };

  const outboxWhereCompound = () => {
    let statusFilter: string | null = null;
    let reversed = false;
    let offsetN = 0;
    let limitN = Number.POSITIVE_INFINITY;
    const chain = {
      between(lo: unknown[]) {
        statusFilter = (lo as [string, unknown])[0];
        return chain;
      },
      reverse() {
        reversed = !reversed;
        return chain;
      },
      offset(n: number) {
        offsetN = n;
        return chain;
      },
      limit(n: number) {
        limitN = n;
        return chain;
      },
      async toArray() {
        const filtered = state.outbox.filter((r) => r.status === statusFilter);
        const sorted = filtered.sort((a, b) =>
          reversed ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
        );
        return sorted.slice(offsetN, offsetN + limitN);
      },
    };
    return chain;
  };

  const syncOutbox = {
    orderBy: outboxOrderBy,
    where(index: string) {
      if (index === "[status+createdAt]") return outboxWhereCompound();
      throw new Error(`unexpected outbox where index: ${index}`);
    },
  };

  const makeBySyncIdTable = <T extends { syncId: string }>(rows: T[]) => ({
    where(index: string) {
      if (index !== "syncId") throw new Error(`unexpected index: ${index}`);
      return {
        anyOf(syncIds: string[]) {
          return {
            async toArray() {
              return rows.filter((r) => syncIds.includes(r.syncId));
            },
          };
        },
      };
    },
  });

  return {
    db: {
      syncOutbox,
      workspaces: makeBySyncIdTable(state.workspaces),
      tabCollections: makeBySyncIdTable(state.collections),
    },
  };
});

import { db } from "@/lib/db";
import { loadSyncLog } from "@/lib/sync-log-loader";

function getState(): TestState {
  const s = globalThis.__syncLogLoaderTestState;
  if (!s) throw new Error("test state not initialized");
  return s;
}

function seedOutbox(partial: Partial<OutboxRow>): OutboxRow {
  const state = getState();
  const row: OutboxRow = {
    id: state.outbox.length + 1,
    opId: partial.opId ?? `op-${state.outbox.length + 1}`,
    entityType: partial.entityType ?? "workspace",
    entitySyncId: partial.entitySyncId ?? `sync-${state.outbox.length + 1}`,
    action: partial.action ?? "create",
    payload: partial.payload ?? {},
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

function seedWorkspace(syncId: string, name: string): WorkspaceRow {
  const state = getState();
  const row = { id: state.workspaces.length + 1, syncId, name };
  state.workspaces.push(row);
  return row;
}

function seedCollection(syncId: string, name: string, workspaceSyncId?: string): CollectionRow {
  const state = getState();
  const row = { id: state.collections.length + 1, syncId, name, workspaceSyncId };
  state.collections.push(row);
  return row;
}

beforeEach(() => {
  // Mutate in place — the mock factory closures capture array references, so
  // reassigning would orphan the lookup tables.
  const state = getState();
  state.outbox.length = 0;
  state.workspaces.length = 0;
  state.collections.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  // nothing per-test to tear down
});

describe("loadSyncLog", () => {
  it("returns empty array when outbox is empty", async () => {
    const rows = await loadSyncLog(db as unknown as Parameters<typeof loadSyncLog>[0], 1, "all");
    expect(rows).toEqual([]);
  });

  it("loads a tab row with workspace + collection + tab names resolved via batch lookup", async () => {
    const wsSyncId = "018f1a2b-3c4d-7abc-8def-000000000001";
    const colSyncId = "018f1a2b-3c4d-7abc-8def-000000000002";
    const tabSyncId = "018f1a2b-3c4d-7abc-8def-000000000003";
    seedWorkspace(wsSyncId, "Personal");
    seedCollection(colSyncId, "Research", wsSyncId);

    seedOutbox({
      entityType: "workspace",
      entitySyncId: wsSyncId,
      action: "create",
      payload: { syncId: wsSyncId, name: "Personal" },
    });
    seedOutbox({
      entityType: "collection",
      entitySyncId: colSyncId,
      action: "update",
      payload: { syncId: colSyncId, name: "Research", workspaceSyncId: wsSyncId },
    });
    seedOutbox({
      entityType: "tab",
      entitySyncId: tabSyncId,
      action: "create",
      payload: { syncId: tabSyncId, title: "Anthropic", collectionSyncId: colSyncId },
    });

    const rows = await loadSyncLog(db as unknown as Parameters<typeof loadSyncLog>[0], 1, "all");

    // id desc → tab first, then collection, then workspace
    expect(rows.map((r) => r.entityType)).toEqual(["tab", "collection", "workspace"]);

    const tabRow = rows[0];
    expect(tabRow.entityType).toBe("tab");
    expect(tabRow.workspaceName).toBe("Personal");
    expect(tabRow.collectionName).toBe("Research");
    expect(tabRow.tabTitle).toBe("Anthropic");
    expect(tabRow.fallbackSyncIdPrefix).toBe(tabSyncId.slice(0, 4));

    const colRow = rows[1];
    expect(colRow.entityType).toBe("collection");
    expect(colRow.workspaceName).toBe("Personal");
    expect(colRow.collectionName).toBe("Research");
    expect(colRow.tabTitle).toBeNull();

    const wsRow = rows[2];
    expect(wsRow.entityType).toBe("workspace");
    expect(wsRow.workspaceName).toBe("Personal");
    expect(wsRow.collectionName).toBeNull();
    expect(wsRow.tabTitle).toBeNull();
  });

  it("falls back to syncId prefix when parent workspace/collection has been hard-deleted", async () => {
    // No workspaces / collections seeded — parents are gone.
    const orphanColSyncId = "018f1a2b-3c4d-7abc-8def-000000000010";
    const orphanTabSyncId = "018f1a2b-3c4d-7abc-8def-000000000011";

    seedOutbox({
      entityType: "collection",
      entitySyncId: orphanColSyncId,
      action: "delete",
      payload: { syncId: orphanColSyncId, workspaceSyncId: "missing-ws-syncid" },
    });
    seedOutbox({
      entityType: "tab",
      entitySyncId: orphanTabSyncId,
      action: "delete",
      payload: { syncId: orphanTabSyncId, collectionSyncId: "missing-col-syncid" },
    });

    const rows = await loadSyncLog(db as unknown as Parameters<typeof loadSyncLog>[0], 1, "all");

    // Both rows resolve to null name fields; UI uses fallbackSyncIdPrefix.
    const tabRow = rows.find((r) => r.entityType === "tab");
    const colRow = rows.find((r) => r.entityType === "collection");
    expect(tabRow).toBeDefined();
    expect(colRow).toBeDefined();

    expect(tabRow!.workspaceName).toBeNull();
    expect(tabRow!.collectionName).toBeNull();
    expect(tabRow!.tabTitle).toBeNull(); // delete action has no payload.title
    expect(tabRow!.fallbackSyncIdPrefix).toBe(orphanTabSyncId.slice(0, 4));

    expect(colRow!.workspaceName).toBeNull();
    expect(colRow!.collectionName).toBeNull(); // delete action
    expect(colRow!.fallbackSyncIdPrefix).toBe(orphanColSyncId.slice(0, 4));
  });

  it("filter='dead' returns only dead rows; filter='all' returns all rows in id desc order", async () => {
    seedOutbox({ status: "pending", createdAt: 1 });
    seedOutbox({ status: "synced", createdAt: 2 });
    seedOutbox({ status: "failed", createdAt: 3 });
    seedOutbox({ status: "dead", createdAt: 4 });
    seedOutbox({ status: "dead", createdAt: 5 });

    const dead = await loadSyncLog(db as unknown as Parameters<typeof loadSyncLog>[0], 1, "dead");
    expect(dead).toHaveLength(2);
    expect(dead.every((r) => r.status === "dead")).toBe(true);

    const all = await loadSyncLog(db as unknown as Parameters<typeof loadSyncLog>[0], 1, "all");
    expect(all).toHaveLength(5);
    // id desc → newest first (id 5 → 4 → 3 → 2 → 1)
    expect(all.map((r) => r.id)).toEqual([5, 4, 3, 2, 1]);
  });
});
