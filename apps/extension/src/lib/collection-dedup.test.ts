import { describe, expect, it } from "vitest";
import { computeCollectionDuplicates } from "@/lib/collection-dedup";
import type { CollectionTab } from "@/lib/db";

function makeTab(overrides: Partial<CollectionTab>): CollectionTab {
  return {
    collectionId: 1,
    url: "https://example.com/",
    title: "Example",
    order: "a0",
    syncId: `sync-${Math.random()}`,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("computeCollectionDuplicates", () => {
  it("returns empty result when all tabs are unique", () => {
    const tabs = [
      makeTab({ id: 1, url: "https://a/" }),
      makeTab({ id: 2, url: "https://b/" }),
      makeTab({ id: 3, url: "https://c/" }),
    ];
    const result = computeCollectionDuplicates(tabs);
    expect(result.removedCount).toBe(0);
    expect(result.affectedUrls).toEqual([]);
    expect(result.removedTabIds).toEqual([]);
  });

  it("groups by exact URL string (case-sensitive) and keeps the earliest createdAt", () => {
    const tabs = [
      makeTab({ id: 1, url: "https://x/", createdAt: 2_000 }),
      makeTab({ id: 2, url: "https://x/", createdAt: 1_000, favIconUrl: "icon2" }),
      makeTab({ id: 3, url: "https://x/", createdAt: 3_000 }),
    ];
    const result = computeCollectionDuplicates(tabs);
    expect(result.removedCount).toBe(2);
    expect(result.removedTabIds.sort()).toEqual([1, 3]);
    expect(result.affectedUrls).toEqual([
      {
        url: "https://x/",
        favIconUrl: "icon2",
        originalCount: 3,
        keptTabId: 2,
      },
    ]);
  });

  it("treats different cases and trailing slashes as different URLs", () => {
    const tabs = [
      makeTab({ id: 1, url: "https://x/" }),
      makeTab({ id: 2, url: "https://X/" }),
      makeTab({ id: 3, url: "https://x" }),
    ];
    const result = computeCollectionDuplicates(tabs);
    expect(result.removedCount).toBe(0);
  });

  it("handles multiple duplicate groups", () => {
    const tabs = [
      makeTab({ id: 1, url: "https://a/", createdAt: 1_000 }),
      makeTab({ id: 2, url: "https://b/", createdAt: 2_000 }),
      makeTab({ id: 3, url: "https://a/", createdAt: 3_000 }),
      makeTab({ id: 4, url: "https://b/", createdAt: 4_000 }),
      makeTab({ id: 5, url: "https://b/", createdAt: 5_000 }),
    ];
    const result = computeCollectionDuplicates(tabs);
    expect(result.removedCount).toBe(3);
    expect(result.affectedUrls.length).toBe(2);
    const aGroup = result.affectedUrls.find((g) => g.url === "https://a/");
    const bGroup = result.affectedUrls.find((g) => g.url === "https://b/");
    expect(aGroup).toMatchObject({ originalCount: 2, keptTabId: 1 });
    expect(bGroup).toMatchObject({ originalCount: 3, keptTabId: 2 });
    expect(result.removedTabIds.sort()).toEqual([3, 4, 5]);
  });

  it("skips tabs without an id (shouldn't happen in practice but stays safe)", () => {
    const tabs = [
      makeTab({ id: undefined, url: "https://x/" }),
      makeTab({ id: 2, url: "https://x/" }),
    ];
    const result = computeCollectionDuplicates(tabs);
    expect(result.removedCount).toBe(0);
  });
});
