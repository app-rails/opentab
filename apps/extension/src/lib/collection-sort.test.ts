import { describe, expect, it } from "vitest";
import { regenerateOrders, sortTabs } from "@/lib/collection-sort";
import type { CollectionTab } from "@/lib/db";

function makeTab(overrides: Partial<CollectionTab>): CollectionTab {
  return {
    collectionId: 1,
    url: "https://example.com/",
    title: "Example",
    order: "a0",
    syncId: "sync-1",
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("sortTabs", () => {
  it("sorts by title ascending using locale-aware compare", () => {
    const tabs = [
      makeTab({ id: 1, title: "Charlie" }),
      makeTab({ id: 2, title: "alpha" }),
      makeTab({ id: 3, title: "Bravo" }),
    ];
    const sorted = sortTabs(tabs, "title", "asc");
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("sorts by title descending", () => {
    const tabs = [makeTab({ id: 1, title: "alpha" }), makeTab({ id: 2, title: "Bravo" })];
    const sorted = sortTabs(tabs, "title", "desc");
    expect(sorted.map((t) => t.id)).toEqual([2, 1]);
  });

  it("places empty titles at the end regardless of direction", () => {
    const tabs = [
      makeTab({ id: 1, title: "" }),
      makeTab({ id: 2, title: "zzz" }),
      makeTab({ id: 3, title: "aaa" }),
    ];
    expect(sortTabs(tabs, "title", "asc").map((t) => t.id)).toEqual([3, 2, 1]);
    expect(sortTabs(tabs, "title", "desc").map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("sorts by domain (hostname, case-insensitive)", () => {
    const tabs = [
      makeTab({ id: 1, url: "https://Zeta.example/" }),
      makeTab({ id: 2, url: "https://apple.com/store" }),
      makeTab({ id: 3, url: "https://github.com/foo" }),
    ];
    expect(sortTabs(tabs, "domain", "asc").map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("places tabs with unparseable URLs at the end when sorting by domain", () => {
    const tabs = [
      makeTab({ id: 1, url: "not a url" }),
      makeTab({ id: 2, url: "https://apple.com/" }),
    ];
    expect(sortTabs(tabs, "domain", "asc").map((t) => t.id)).toEqual([2, 1]);
    expect(sortTabs(tabs, "domain", "desc").map((t) => t.id)).toEqual([2, 1]);
  });

  it("sorts by date added ascending (oldest first) and descending (newest first)", () => {
    const tabs = [
      makeTab({ id: 1, createdAt: 3_000 }),
      makeTab({ id: 2, createdAt: 1_000 }),
      makeTab({ id: 3, createdAt: 2_000 }),
    ];
    expect(sortTabs(tabs, "dateAdded", "asc").map((t) => t.id)).toEqual([2, 3, 1]);
    expect(sortTabs(tabs, "dateAdded", "desc").map((t) => t.id)).toEqual([1, 3, 2]);
  });

  it("is stable for equal keys (preserves current relative order)", () => {
    const tabs = [
      makeTab({ id: 1, title: "same", order: "a0" }),
      makeTab({ id: 2, title: "same", order: "a1" }),
      makeTab({ id: 3, title: "same", order: "a2" }),
    ];
    expect(sortTabs(tabs, "title", "asc").map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("reverse flips the current order regardless of values", () => {
    const tabs = [
      makeTab({ id: 1, order: "a0" }),
      makeTab({ id: 2, order: "a1" }),
      makeTab({ id: 3, order: "a2" }),
    ];
    expect(sortTabs(tabs, "reverse", "asc").map((t) => t.id)).toEqual([3, 2, 1]);
  });
});

describe("regenerateOrders", () => {
  it("produces strictly increasing fractional keys for the given sequence", () => {
    const tabs = [
      makeTab({ id: 1, order: "old1" }),
      makeTab({ id: 2, order: "old2" }),
      makeTab({ id: 3, order: "old3" }),
    ];
    const withNewOrders = regenerateOrders(tabs);
    const keys = withNewOrders.map((t) => t.order);
    expect(keys.length).toBe(3);
    expect(keys[0] < keys[1]).toBe(true);
    expect(keys[1] < keys[2]).toBe(true);
  });

  it("preserves tab identity and other fields", () => {
    const tabs = [makeTab({ id: 7, title: "keep-me", url: "https://x/" })];
    const [out] = regenerateOrders(tabs);
    expect(out.id).toBe(7);
    expect(out.title).toBe("keep-me");
    expect(out.url).toBe("https://x/");
  });
});
