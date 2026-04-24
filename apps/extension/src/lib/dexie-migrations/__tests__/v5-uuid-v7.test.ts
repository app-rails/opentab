import { UUID_V7_REGEX } from "@opentab/protocol";
import type { Transaction } from "dexie";
import { describe, expect, it } from "vitest";
import { upgradeV5 } from "@/lib/dexie-migrations/v5-uuid-v7";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Build a tiny in-memory Transaction-like object that supports exactly the
 * Dexie APIs `upgradeV5` touches: `table().toCollection().modify()` and
 * `table().where().equals().delete()`.
 *
 * We keep it self-contained here (rather than using a generic mock library)
 * because it makes the test assertions unambiguous about which rows got
 * rewritten and in what order.
 */
function makeTx(tables: Record<string, Record<string, unknown>[]>): Transaction {
  const get = (name: string): Record<string, unknown>[] => {
    const rows = tables[name];
    if (!rows) throw new Error(`unknown table: ${name}`);
    return rows;
  };

  const shim = {
    table(name: string) {
      const rows = get(name);
      return {
        toCollection() {
          return {
            async modify(fn: (row: Record<string, unknown>) => void) {
              for (const row of rows) fn(row);
            },
          };
        },
        where(col: string) {
          return {
            equals(value: unknown) {
              return {
                async delete() {
                  // Delete in-place while preserving array identity.
                  for (let i = rows.length - 1; i >= 0; i--) {
                    if (rows[i][col] === value) rows.splice(i, 1);
                  }
                },
              };
            },
          };
        },
      };
    },
  };
  // Only `.table()` is exercised by upgradeV5 — the rest of the Transaction
  // surface is irrelevant here, so a structural cast through `unknown` is
  // safer than `as any` and satisfies Biome without a suppression.
  return shim as unknown as Transaction;
}

/**
 * Seed a v4-style database: all syncId / opId values are UUID v4
 * (via crypto.randomUUID in the real upgrade path).
 */
function seed() {
  const wsSync1 = crypto.randomUUID();
  const wsSync2 = crypto.randomUUID();
  const colSync1 = crypto.randomUUID();
  const colSync2 = crypto.randomUUID();
  const tabSync1 = crypto.randomUUID();
  const outboxOpId = crypto.randomUUID();

  return {
    workspaces: [
      { id: 1, syncId: wsSync1, name: "Personal" },
      { id: 2, syncId: wsSync2, name: "Work" },
    ] as Record<string, unknown>[],
    tabCollections: [
      { id: 10, syncId: colSync1, workspaceSyncId: wsSync1, name: "Reading" },
      { id: 11, syncId: colSync2, workspaceSyncId: wsSync2, name: "Todo" },
    ] as Record<string, unknown>[],
    collectionTabs: [
      { id: 100, syncId: tabSync1, collectionSyncId: colSync1, url: "https://ex.com" },
    ] as Record<string, unknown>[],
    syncOutbox: [
      {
        id: 1000,
        opId: outboxOpId,
        entitySyncId: colSync1,
        payload: { syncId: colSync1, parentSyncId: wsSync1, name: "Reading" },
      },
    ] as Record<string, unknown>[],
    syncMeta: [
      { key: "lastPulledCursor", value: 42 },
      { key: "someOther", value: "keep-me" },
    ] as Record<string, unknown>[],
  };
}

describe("upgradeV5 (Dexie v5 migration — UUID v4 → v7)", () => {
  it("rewrites every workspace syncId as UUID v7", async () => {
    const tables = seed();
    const before = tables.workspaces.map((w) => w.syncId as string);
    expect(before.every((s) => UUID_V4_REGEX.test(s))).toBe(true);

    await upgradeV5(makeTx(tables));

    for (const ws of tables.workspaces) {
      expect(ws.syncId).toMatch(UUID_V7_REGEX);
    }
    // The new ids must not equal any of the old ones.
    const after = new Set(tables.workspaces.map((w) => w.syncId as string));
    for (const old of before) expect(after.has(old)).toBe(false);
  });

  it("rewrites every collection's workspaceSyncId to the new parent syncId", async () => {
    const tables = seed();
    await upgradeV5(makeTx(tables));

    const wsById = new Map(tables.workspaces.map((w) => [w.id, w.syncId]));
    // Collection 10 was parented to workspace 1, collection 11 to workspace 2.
    const col1 = tables.tabCollections.find((c) => c.id === 10);
    const col2 = tables.tabCollections.find((c) => c.id === 11);
    expect(col1?.workspaceSyncId).toBe(wsById.get(1));
    expect(col2?.workspaceSyncId).toBe(wsById.get(2));
    expect(col1?.syncId).toMatch(UUID_V7_REGEX);
    expect(col2?.syncId).toMatch(UUID_V7_REGEX);
  });

  it("rewrites every tab's collectionSyncId to the new parent syncId", async () => {
    const tables = seed();
    await upgradeV5(makeTx(tables));

    const colById = new Map(tables.tabCollections.map((c) => [c.id, c.syncId]));
    const tab = tables.collectionTabs[0];
    expect(tab.collectionSyncId).toBe(colById.get(10));
    expect(tab.syncId).toMatch(UUID_V7_REGEX);
  });

  it("remaps syncOutbox: entitySyncId, payload.syncId, payload.parentSyncId, and regenerates opId as v7", async () => {
    const tables = seed();
    const originalOpId = tables.syncOutbox[0].opId as string;
    const originalEntity = tables.syncOutbox[0].entitySyncId as string;
    expect(originalOpId).toMatch(UUID_V4_REGEX);

    await upgradeV5(makeTx(tables));

    const row = tables.syncOutbox[0];
    expect(row.opId).toMatch(UUID_V7_REGEX);
    expect(row.opId).not.toBe(originalOpId);
    expect(row.entitySyncId).toMatch(UUID_V7_REGEX);
    expect(row.entitySyncId).not.toBe(originalEntity);

    const payload = row.payload as { syncId: string; parentSyncId: string };
    expect(payload.syncId).toMatch(UUID_V7_REGEX);
    expect(payload.parentSyncId).toMatch(UUID_V7_REGEX);

    // The payload.syncId should equal the new collection syncId (entity matched col 10).
    const col1 = tables.tabCollections.find((c) => c.id === 10);
    const ws1 = tables.workspaces.find((w) => w.id === 1);
    expect(payload.syncId).toBe(col1?.syncId);
    expect(payload.parentSyncId).toBe(ws1?.syncId);
    expect(row.entitySyncId).toBe(col1?.syncId);
  });

  it("deletes the syncMeta lastPulledCursor row but leaves other keys intact", async () => {
    const tables = seed();
    await upgradeV5(makeTx(tables));

    expect(tables.syncMeta.find((r) => r.key === "lastPulledCursor")).toBeUndefined();
    expect(tables.syncMeta.find((r) => r.key === "someOther")).toBeDefined();
  });
});
