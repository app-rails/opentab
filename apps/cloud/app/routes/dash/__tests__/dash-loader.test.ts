import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import { loadDash } from "~/routes/dash/index";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";

async function seedWorkspace(
  db: Db,
  overrides: Partial<typeof workspaces.$inferInsert> = {},
): Promise<typeof workspaces.$inferSelect> {
  const base = {
    userId: overrides.userId ?? USER_A,
    syncId: overrides.syncId ?? uuidv7(),
    name: overrides.name ?? "WS",
    icon: overrides.icon ?? null,
    viewMode: overrides.viewMode ?? null,
    order: overrides.order ?? "a0",
    lastOpId: overrides.lastOpId ?? uuidv7(),
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(1000),
    updatedAt: overrides.updatedAt ?? new Date(2000),
  };
  const rows = await db.insert(workspaces).values(base).returning();
  return rows[0]!;
}

async function seedCollection(
  db: Db,
  workspaceSyncId: string,
  overrides: Partial<typeof tabCollections.$inferInsert> = {},
): Promise<typeof tabCollections.$inferSelect> {
  const base = {
    userId: overrides.userId ?? USER_A,
    syncId: overrides.syncId ?? uuidv7(),
    workspaceSyncId,
    name: overrides.name ?? "C",
    order: overrides.order ?? "a0",
    lastOpId: overrides.lastOpId ?? uuidv7(),
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(1000),
    updatedAt: overrides.updatedAt ?? new Date(2000),
  };
  const rows = await db.insert(tabCollections).values(base).returning();
  return rows[0]!;
}

async function seedTab(
  db: Db,
  collectionSyncId: string,
  overrides: Partial<typeof collectionTabs.$inferInsert> = {},
) {
  await db.insert(collectionTabs).values({
    userId: overrides.userId ?? USER_A,
    syncId: overrides.syncId ?? uuidv7(),
    collectionSyncId,
    url: overrides.url ?? "https://example.com",
    title: overrides.title ?? "Example",
    favIconUrl: overrides.favIconUrl ?? null,
    order: overrides.order ?? "a0",
    lastOpId: overrides.lastOpId ?? uuidv7(),
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(1000),
    updatedAt: overrides.updatedAt ?? new Date(2000),
  });
}

describe("loadDash", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns empty shape for a user with no data", async () => {
    const result = await loadDash(db, USER_A);
    expect(result).toEqual({ workspaces: [], totalCollections: 0, totalTabs: 0 });
  });

  it("rolls up collection + tab counts per workspace", async () => {
    const w1 = await seedWorkspace(db, { name: "W1", order: "a0" });
    const w2 = await seedWorkspace(db, { name: "W2", order: "a1" });
    const c1 = await seedCollection(db, w1.syncId);
    const c2 = await seedCollection(db, w1.syncId);
    const c3 = await seedCollection(db, w2.syncId);
    await seedTab(db, c1.syncId);
    await seedTab(db, c1.syncId);
    await seedTab(db, c2.syncId);
    await seedTab(db, c3.syncId);

    const { workspaces: wsCards, totalCollections, totalTabs } = await loadDash(db, USER_A);
    expect(wsCards).toHaveLength(2);
    // Sorted by order asc: W1 (a0), W2 (a1)
    expect(wsCards.map((w) => w.name)).toEqual(["W1", "W2"]);

    const w1Card = wsCards.find((w) => w.syncId === w1.syncId);
    const w2Card = wsCards.find((w) => w.syncId === w2.syncId);
    expect(w1Card?.collectionCount).toBe(2);
    expect(w1Card?.tabCount).toBe(3); // 2 + 1
    expect(w2Card?.collectionCount).toBe(1);
    expect(w2Card?.tabCount).toBe(1);

    expect(totalCollections).toBe(3);
    expect(totalTabs).toBe(4);
  });

  it("excludes soft-deleted workspaces, collections, and tabs", async () => {
    const w1 = await seedWorkspace(db, { name: "Alive", order: "a0" });
    await seedWorkspace(db, { name: "Dead", order: "a1", deletedAt: new Date(5000) });
    const c1 = await seedCollection(db, w1.syncId, { name: "ColLive" });
    await seedCollection(db, w1.syncId, { name: "ColDead", deletedAt: new Date(5000) });
    await seedTab(db, c1.syncId);
    await seedTab(db, c1.syncId, { deletedAt: new Date(5000) });

    const { workspaces: wsCards, totalCollections, totalTabs } = await loadDash(db, USER_A);
    expect(wsCards.map((w) => w.name)).toEqual(["Alive"]);
    expect(wsCards[0]?.collectionCount).toBe(1);
    expect(wsCards[0]?.tabCount).toBe(1);
    expect(totalCollections).toBe(1);
    expect(totalTabs).toBe(1);
  });

  it("scopes every query to the caller's userId", async () => {
    const w1 = await seedWorkspace(db, { userId: USER_A });
    await seedCollection(db, w1.syncId, { userId: USER_A });
    // Noise from another user
    const other = await seedWorkspace(db, { userId: "user-b" });
    const otherC = await seedCollection(db, other.syncId, { userId: "user-b" });
    await seedTab(db, otherC.syncId, { userId: "user-b" });

    const result = await loadDash(db, USER_A);
    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0]?.syncId).toBe(w1.syncId);
    expect(result.totalCollections).toBe(1);
    expect(result.totalTabs).toBe(0);
  });

  it("sorts workspaces lexicographically by `order`", async () => {
    await seedWorkspace(db, { name: "B", order: "b" });
    await seedWorkspace(db, { name: "A", order: "a" });
    await seedWorkspace(db, { name: "AA", order: "aa" });

    const { workspaces: wsCards } = await loadDash(db, USER_A);
    expect(wsCards.map((w) => w.name)).toEqual(["A", "AA", "B"]);
  });

  it("exposes updatedAt as ms epoch number", async () => {
    await seedWorkspace(db, { updatedAt: new Date(7000) });
    const { workspaces: wsCards } = await loadDash(db, USER_A);
    expect(typeof wsCards[0]?.updatedAt).toBe("number");
    expect(wsCards[0]?.updatedAt).toBe(7000);
  });

  describe("previewFavIcons", () => {
    it("aggregates unique non-null favIcons per workspace, capped at 5", async () => {
      // WS1: 2 collections, 8 tabs. Mix of unique + duplicate favicons + nulls.
      const w1 = await seedWorkspace(db, { name: "W1", order: "a0" });
      const w1c1 = await seedCollection(db, w1.syncId);
      const w1c2 = await seedCollection(db, w1.syncId);
      // c1: a, b, null, a (dup)
      await seedTab(db, w1c1.syncId, { favIconUrl: "https://a.example/icon.png" });
      await seedTab(db, w1c1.syncId, { favIconUrl: "https://b.example/icon.png" });
      await seedTab(db, w1c1.syncId, { favIconUrl: null });
      await seedTab(db, w1c1.syncId, { favIconUrl: "https://a.example/icon.png" });
      // c2: c, b (dup across collections), null, d
      await seedTab(db, w1c2.syncId, { favIconUrl: "https://c.example/icon.png" });
      await seedTab(db, w1c2.syncId, { favIconUrl: "https://b.example/icon.png" });
      await seedTab(db, w1c2.syncId, { favIconUrl: null });
      await seedTab(db, w1c2.syncId, { favIconUrl: "https://d.example/icon.png" });

      // WS2: 2 collections, 10 tabs, all unique favicons → expect cap at 5.
      const w2 = await seedWorkspace(db, { name: "W2", order: "a1" });
      const w2c1 = await seedCollection(db, w2.syncId);
      const w2c2 = await seedCollection(db, w2.syncId);
      for (let i = 0; i < 5; i++) {
        await seedTab(db, w2c1.syncId, { favIconUrl: `https://w2c1-${i}.example/icon.png` });
      }
      for (let i = 0; i < 5; i++) {
        await seedTab(db, w2c2.syncId, { favIconUrl: `https://w2c2-${i}.example/icon.png` });
      }

      // WS3: 2 collections, 7 tabs, all favIconUrl null → expect [].
      const w3 = await seedWorkspace(db, { name: "W3", order: "a2" });
      const w3c1 = await seedCollection(db, w3.syncId);
      const w3c2 = await seedCollection(db, w3.syncId);
      for (let i = 0; i < 4; i++) {
        await seedTab(db, w3c1.syncId, { favIconUrl: null });
      }
      for (let i = 0; i < 3; i++) {
        await seedTab(db, w3c2.syncId, { favIconUrl: null });
      }

      const { workspaces: wsCards } = await loadDash(db, USER_A);
      const w1Card = wsCards.find((w) => w.syncId === w1.syncId);
      const w2Card = wsCards.find((w) => w.syncId === w2.syncId);
      const w3Card = wsCards.find((w) => w.syncId === w3.syncId);

      // W1: should have 4 unique non-null favicons (a, b, c, d), no nulls, no dups.
      expect(w1Card?.previewFavIcons).toBeDefined();
      expect(Array.isArray(w1Card?.previewFavIcons)).toBe(true);
      expect(w1Card?.previewFavIcons.length).toBeGreaterThanOrEqual(1);
      expect(w1Card?.previewFavIcons.length).toBeLessThanOrEqual(5);
      expect(w1Card?.previewFavIcons.every((u) => typeof u === "string" && u.length > 0)).toBe(
        true,
      );
      expect(new Set(w1Card?.previewFavIcons).size).toBe(w1Card?.previewFavIcons.length);
      expect(new Set(w1Card?.previewFavIcons)).toEqual(
        new Set([
          "https://a.example/icon.png",
          "https://b.example/icon.png",
          "https://c.example/icon.png",
          "https://d.example/icon.png",
        ]),
      );

      // W2: capped at 5 unique non-null entries.
      expect(w2Card?.previewFavIcons.length).toBe(5);
      expect(new Set(w2Card?.previewFavIcons).size).toBe(5);
      expect(w2Card?.previewFavIcons.every((u) => typeof u === "string" && u.length > 0)).toBe(
        true,
      );

      // W3: no favicons → empty array.
      expect(w3Card?.previewFavIcons).toEqual([]);
    });
  });
});
