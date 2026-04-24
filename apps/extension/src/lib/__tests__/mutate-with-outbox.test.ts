/**
 * Round-trip test for Task 36: once call sites mint ids via `uuidv7()`,
 * outbox rows materialized through `mutateWithOutbox` must carry a v7-shaped
 * `opId` and `payload.syncId`.
 *
 * The test mocks `@/lib/db` with a minimal in-memory syncOutbox so we can
 * observe the shape of the row that actually gets persisted.
 */
import { UUID_V7_REGEX } from "@opentab/protocol";
import { v7 as uuidv7 } from "uuid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredRow = Record<string, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var __mutateOutboxTestState: { rows: StoredRow[] } | undefined;
}

vi.mock("@/lib/db", () => {
  const state: { rows: StoredRow[] } = { rows: [] };
  globalThis.__mutateOutboxTestState = state;

  const syncOutbox = {
    async bulkAdd(rows: StoredRow[]) {
      for (const r of rows) state.rows.push({ ...r });
    },
  };

  return {
    db: {
      syncOutbox,
      workspaces: {},
      tabCollections: {},
      collectionTabs: {},
      // mutateWithOutbox opens a rw transaction with a list of tables, then
      // invokes the callback. We approximate that by awaiting the callback
      // and then running bulkAdd — identical semantics for assertion purposes.
      async transaction(_mode: string, _tables: unknown[], cb: () => Promise<void>) {
        await cb();
      },
    },
  };
});

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
});

import { mutateWithOutbox, newPendingOp } from "@/lib/mutate-with-outbox";

function getState() {
  const s = globalThis.__mutateOutboxTestState;
  if (!s) throw new Error("test state not initialized");
  return s;
}

beforeEach(() => {
  getState().rows = [];
  vi.clearAllMocks();
});

afterEach(() => {
  // keep chrome stub
});

describe("mutateWithOutbox round-trip (Task 36: UUID v7 at id production sites)", () => {
  it("persists an outbox row whose opId and payload.syncId both match UUID_V7_REGEX", async () => {
    const opId = uuidv7();
    const syncId = uuidv7();
    const now = Date.now();

    await mutateWithOutbox(async () => {
      // No real DB work needed for this assertion.
    }, [
      {
        opId,
        entityType: "workspace",
        entitySyncId: syncId,
        action: "create",
        payload: {
          syncId,
          name: "Round-trip",
          icon: "folder",
          order: "a0",
          updatedAt: now,
          deletedAt: null,
        },
        createdAt: now,
      },
    ]);

    const rows = getState().rows;
    expect(rows).toHaveLength(1);
    const row = rows[0] as { opId: string; payload: { syncId: string } };
    expect(row.opId).toMatch(UUID_V7_REGEX);
    expect(row.payload.syncId).toMatch(UUID_V7_REGEX);
  });

  it("newPendingOp preserves caller-supplied v7 ids verbatim", () => {
    const opId = uuidv7();
    const syncId = uuidv7();
    const pending = newPendingOp({
      opId,
      entityType: "workspace",
      entitySyncId: syncId,
      action: "create",
      payload: { syncId, name: "n", icon: "folder", order: "a0", updatedAt: 1, deletedAt: null },
      createdAt: 1,
    });
    expect(pending.opId).toBe(opId);
    expect(pending.opId).toMatch(UUID_V7_REGEX);
    expect((pending.payload as { syncId: string }).syncId).toMatch(UUID_V7_REGEX);
    expect(pending.status).toBe("pending");
  });
});
