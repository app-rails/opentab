# Collection Sort & Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-collection Sort (by Title/Domain/Date added, Asc/Desc, plus Reverse) and exact-URL Dedupe (keep earliest) actions to the OpenTab extension, triggered from the collection card toolbar.

**Architecture:** Keep pure logic (sort comparators, dedup grouping) in `src/lib/` where it can be unit-tested without Dexie or React. Expose two new Zustand store actions (`sortCollectionTabs`, `applyCollectionDedup`) plus one pure selector (`computeCollectionDuplicates`) that all route through the existing `mutateWithOutbox` outbox. UI: a Popover-based sort menu and a Radix Dialog for the dedupe confirm, both invoked from two new icon buttons in the collection card header with a visual separator from other actions.

**Tech Stack:** WXT, React 19, Zustand, Dexie, fractional-indexing, Radix Popover/Dialog, Tailwind, i18next, sonner (toast), vitest (new — pure-logic only).

**Reference spec:** `docs/superpowers/specs/2026-04-20-collection-sort-dedup-design.md`

---

## File Structure

New:
- `apps/extension/vitest.config.ts` — minimal vitest config (no jsdom; pure logic only)
- `apps/extension/src/lib/collection-sort.ts` — pure comparators + order regenerator
- `apps/extension/src/lib/collection-sort.test.ts`
- `apps/extension/src/lib/collection-dedup.ts` — pure `computeCollectionDuplicates`
- `apps/extension/src/lib/collection-dedup.test.ts`
- `apps/extension/src/components/collection/collection-sort-menu.tsx` — Popover with radios + segment + Apply + Reverse
- `apps/extension/src/components/collection/dedup-confirm-dialog.tsx` — Radix Dialog with preview list

Modified:
- `apps/extension/package.json` — add vitest devDep + `test` script
- `apps/extension/src/stores/app-store.ts` — add `sortCollectionTabs`, `computeCollectionDuplicates`, `applyCollectionDedup`
- `apps/extension/src/components/collection/collection-card.tsx` — two new icon buttons, separators, disabled state, wire menu + dialog
- `apps/extension/src/locales/en.json`, `apps/extension/src/locales/zh.json` — new i18n keys

---

## Task 1: Set up vitest in the extension package

**Files:**
- Create: `apps/extension/vitest.config.ts`
- Modify: `apps/extension/package.json`

- [ ] **Step 1: Add vitest to `apps/extension/package.json` devDependencies and a `test` script**

Edit `apps/extension/package.json`:

```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "check-types": "tsc --noEmit",
    "lint": "biome check .",
    "test": "vitest run",
    "postinstall": "wxt prepare"
  }
}
```

And add to devDependencies:

```json
    "vitest": "^2.1.8"
```

- [ ] **Step 2: Create `apps/extension/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Pure-logic tests only. No jsdom/happy-dom needed.
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: Install the new dep**

Run: `pnpm install`
Expected: vitest appears under `apps/extension/node_modules/.bin/vitest`.

- [ ] **Step 4: Verify the test runner works (no tests yet is fine)**

Run: `pnpm --filter @opentab/extension test`
Expected: exits 0 with "No test files found" or similar — not a hard failure.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/package.json apps/extension/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(extension): set up vitest for pure-logic tests"
```

---

## Task 2: Pure sort logic — write failing tests

**Files:**
- Create: `apps/extension/src/lib/collection-sort.test.ts`

- [ ] **Step 1: Write the test file with failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { CollectionTab } from "@/lib/db";
import { regenerateOrders, sortTabs } from "@/lib/collection-sort";

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
    const tabs = [
      makeTab({ id: 1, title: "alpha" }),
      makeTab({ id: 2, title: "Bravo" }),
    ];
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
    // Input is in current-order order; expect the same order back
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @opentab/extension test`
Expected: FAIL — module `@/lib/collection-sort` does not exist.

- [ ] **Step 3: Commit (test-only)**

```bash
git add apps/extension/src/lib/collection-sort.test.ts
git commit -m "test(extension): add failing tests for collection sort"
```

---

## Task 3: Pure sort logic — implement to pass

**Files:**
- Create: `apps/extension/src/lib/collection-sort.ts`

- [ ] **Step 1: Create `collection-sort.ts` with the minimum to make tests pass**

```ts
import { generateKeyBetween } from "fractional-indexing";
import type { CollectionTab } from "@/lib/db";

export type SortKey = "title" | "domain" | "dateAdded" | "reverse";
export type SortDirection = "asc" | "desc";

type Comparator = (a: CollectionTab, b: CollectionTab) => number;

function hostnameOrNull(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function nullableCompare<T>(
  a: T | null,
  b: T | null,
  cmp: (x: T, y: T) => number,
): number {
  const aEmpty = a === null || a === "";
  const bEmpty = b === null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // empties always at the end
  if (bEmpty) return -1;
  return cmp(a as T, b as T);
}

function titleCompare(a: CollectionTab, b: CollectionTab): number {
  return nullableCompare(a.title ?? "", b.title ?? "", (x, y) =>
    x.localeCompare(y, undefined, { sensitivity: "base", numeric: true }),
  );
}

function domainCompare(a: CollectionTab, b: CollectionTab): number {
  return nullableCompare(hostnameOrNull(a.url), hostnameOrNull(b.url), (x, y) =>
    x.localeCompare(y),
  );
}

function dateAddedCompare(a: CollectionTab, b: CollectionTab): number {
  return a.createdAt - b.createdAt;
}

function pickComparator(key: Exclude<SortKey, "reverse">): Comparator {
  switch (key) {
    case "title":
      return titleCompare;
    case "domain":
      return domainCompare;
    case "dateAdded":
      return dateAddedCompare;
  }
}

/**
 * Returns a new array of tabs in the target order. Input order is preserved
 * for tiebreakers so the sort is stable. For `key === "reverse"`, returns the
 * input reversed (direction is ignored).
 */
export function sortTabs(
  tabs: CollectionTab[],
  key: SortKey,
  direction: SortDirection,
): CollectionTab[] {
  if (key === "reverse") {
    return [...tabs].reverse();
  }
  const cmp = pickComparator(key);
  const sign = direction === "desc" ? -1 : 1;
  // Decorate with original index for stability, then strip.
  return tabs
    .map((tab, idx) => ({ tab, idx }))
    .sort((a, b) => {
      // Empties must always be last regardless of direction — handle before applying sign.
      const raw = cmp(a.tab, b.tab);
      // Detect "empty sentinel" case: nullableCompare returned ±1 due to emptiness.
      // If exactly one side is empty we keep it at the end regardless of asc/desc.
      const aKeyEmpty = isEmptyKey(a.tab, key);
      const bKeyEmpty = isEmptyKey(b.tab, key);
      if (aKeyEmpty !== bKeyEmpty) return aKeyEmpty ? 1 : -1;
      if (raw !== 0) return sign * raw;
      return a.idx - b.idx;
    })
    .map((entry) => entry.tab);
}

function isEmptyKey(tab: CollectionTab, key: Exclude<SortKey, "reverse">): boolean {
  if (key === "title") return !tab.title;
  if (key === "domain") return hostnameOrNull(tab.url) === null;
  return false;
}

/**
 * Given tabs in the desired final order, return new tab objects with fresh
 * strictly-increasing fractional `order` keys. Other fields are carried over.
 */
export function regenerateOrders(tabs: CollectionTab[]): CollectionTab[] {
  let prev: string | null = null;
  const out: CollectionTab[] = [];
  for (const tab of tabs) {
    const next = generateKeyBetween(prev, null);
    out.push({ ...tab, order: next });
    prev = next;
  }
  return out;
}
```

- [ ] **Step 2: Run the tests and confirm they all pass**

Run: `pnpm --filter @opentab/extension test`
Expected: PASS — all 9 tests green.

- [ ] **Step 3: Run type-check and lint**

Run: `pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/lib/collection-sort.ts
git commit -m "feat(extension): add pure sort comparators and order regenerator"
```

---

## Task 4: Pure dedup logic — write failing tests

**Files:**
- Create: `apps/extension/src/lib/collection-dedup.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { CollectionTab } from "@/lib/db";
import { computeCollectionDuplicates } from "@/lib/collection-dedup";

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
    const aGroup = result.affectedUrls.find((g) => g.url === "https://a/")!;
    const bGroup = result.affectedUrls.find((g) => g.url === "https://b/")!;
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
    // Only one tab with an id — nothing to dedupe.
    expect(result.removedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @opentab/extension test`
Expected: FAIL — `@/lib/collection-dedup` not found.

- [ ] **Step 3: Commit test-only change**

```bash
git add apps/extension/src/lib/collection-dedup.test.ts
git commit -m "test(extension): add failing tests for collection dedup"
```

---

## Task 5: Pure dedup logic — implement to pass

**Files:**
- Create: `apps/extension/src/lib/collection-dedup.ts`

- [ ] **Step 1: Implement the grouping**

```ts
import type { CollectionTab } from "@/lib/db";

export interface DedupAffectedUrl {
  url: string;
  favIconUrl?: string;
  originalCount: number;
  keptTabId: number;
}

export interface DedupResult {
  removedCount: number;
  removedTabIds: number[];
  affectedUrls: DedupAffectedUrl[];
}

/**
 * Pure computation: which tabs would be removed by a dedupe operation, and
 * a per-URL preview suitable for the confirm dialog. Keeps the earliest
 * createdAt of each duplicate group. URL comparison is exact string equality.
 * Tabs without an id are ignored (treated as invisible to dedup).
 */
export function computeCollectionDuplicates(tabs: CollectionTab[]): DedupResult {
  const groups = new Map<string, CollectionTab[]>();
  for (const tab of tabs) {
    if (tab.id == null) continue;
    const list = groups.get(tab.url);
    if (list) {
      list.push(tab);
    } else {
      groups.set(tab.url, [tab]);
    }
  }

  const affectedUrls: DedupAffectedUrl[] = [];
  const removedTabIds: number[] = [];

  for (const [url, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt);
    const kept = sorted[0];
    const removed = sorted.slice(1);
    affectedUrls.push({
      url,
      favIconUrl: kept.favIconUrl,
      originalCount: list.length,
      keptTabId: kept.id!,
    });
    for (const tab of removed) {
      removedTabIds.push(tab.id!);
    }
  }

  return {
    removedCount: removedTabIds.length,
    removedTabIds,
    affectedUrls,
  };
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @opentab/extension test`
Expected: PASS — all dedup tests green, all earlier sort tests still green.

- [ ] **Step 3: Type-check and lint**

Run: `pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/lib/collection-dedup.ts
git commit -m "feat(extension): add pure computeCollectionDuplicates"
```

---

## Task 6: Add store action `sortCollectionTabs`

**Files:**
- Modify: `apps/extension/src/stores/app-store.ts`

- [ ] **Step 1: Add the type to the `AppState` interface**

Locate the `// Tab mutations` section (around line 89-100) and add after `reorderTabInCollection`:

```ts
  sortCollectionTabs: (
    collectionId: number,
    key: import("@/lib/collection-sort").SortKey,
    direction: import("@/lib/collection-sort").SortDirection,
  ) => Promise<void>;
```

- [ ] **Step 2: Add the import near the other lib imports (top of file)**

```ts
import { regenerateOrders, sortTabs } from "@/lib/collection-sort";
```

- [ ] **Step 3: Implement the action in the `create<AppState>()((set, get) => ({ ... }))` body**

Add after `reorderTabInCollection`:

```ts
  sortCollectionTabs: async (collectionId, key, direction) => {
    const { tabsByCollection, collections } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs || prevTabs.length < 2) return;

    const parentCol = collections.find((c) => c.id === collectionId);
    if (!parentCol) return;

    const sorted = sortTabs(prevTabs, key, direction);
    const withOrders = regenerateOrders(sorted);
    const now = Date.now();
    const finalTabs = withOrders.map((t) => ({ ...t, updatedAt: now }));

    // Optimistic UI first
    const newMap = new Map(tabsByCollection);
    newMap.set(collectionId, finalTabs);
    set({ tabsByCollection: newMap });

    try {
      const ops: SyncOpInput[] = finalTabs.map((tab) => ({
        opId: crypto.randomUUID(),
        entityType: "tab",
        entitySyncId: tab.syncId,
        action: "update",
        payload: {
          syncId: tab.syncId,
          order: tab.order,
          updatedAt: now,
          deletedAt: null,
        },
        createdAt: now,
      }));

      await mutateWithOutbox(async () => {
        await db.collectionTabs.bulkPut(finalTabs);
      }, ops);
    } catch (err) {
      console.error("[store] failed to sort collection:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(collectionId, prevTabs);
      set({ tabsByCollection: revertMap });
      throw err;
    }
  },
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @opentab/extension check-types`
Expected: exit 0.

- [ ] **Step 5: Lint**

Run: `pnpm --filter @opentab/extension lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/stores/app-store.ts
git commit -m "feat(extension): add sortCollectionTabs store action"
```

---

## Task 7: Add store actions for dedup (`computeCollectionDuplicates`, `applyCollectionDedup`)

**Files:**
- Modify: `apps/extension/src/stores/app-store.ts`

- [ ] **Step 1: Add type declarations to `AppState` (after `sortCollectionTabs`)**

```ts
  computeCollectionDuplicates: (
    collectionId: number,
  ) => import("@/lib/collection-dedup").DedupResult;
  applyCollectionDedup: (
    collectionId: number,
    result: import("@/lib/collection-dedup").DedupResult,
  ) => Promise<void>;
```

- [ ] **Step 2: Add the import at the top of the file**

```ts
import {
  type DedupResult,
  computeCollectionDuplicates as pureComputeDuplicates,
} from "@/lib/collection-dedup";
```

- [ ] **Step 3: Implement `computeCollectionDuplicates` in the store body (after `sortCollectionTabs`)**

```ts
  computeCollectionDuplicates: (collectionId) => {
    const tabs = get().tabsByCollection.get(collectionId) ?? [];
    return pureComputeDuplicates(tabs);
  },
```

- [ ] **Step 4: Implement `applyCollectionDedup` directly after**

```ts
  applyCollectionDedup: async (collectionId, result) => {
    if (result.removedCount === 0) return;

    const { tabsByCollection, collections } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs) return;

    const parentCol = collections.find((c) => c.id === collectionId);
    if (!parentCol) return;

    const removedIds = new Set<number>(result.removedTabIds);
    const tabsToRemove = prevTabs.filter((t) => t.id != null && removedIds.has(t.id));
    if (tabsToRemove.length === 0) return;

    const now = Date.now();
    const nextTabs = prevTabs.filter((t) => t.id == null || !removedIds.has(t.id));

    // Optimistic UI
    const newMap = new Map(tabsByCollection);
    newMap.set(collectionId, nextTabs);
    set({
      tabsByCollection: newMap,
      collections: collections.map((c) =>
        c.id === collectionId ? { ...c, updatedAt: now } : c,
      ),
    });

    try {
      const ops: SyncOpInput[] = [
        ...tabsToRemove.map((tab) => ({
          opId: crypto.randomUUID(),
          entityType: "tab" as const,
          entitySyncId: tab.syncId,
          action: "delete" as const,
          payload: { syncId: tab.syncId, updatedAt: now },
          createdAt: now,
        })),
        {
          opId: crypto.randomUUID(),
          entityType: "collection" as const,
          entitySyncId: parentCol.syncId,
          action: "update" as const,
          payload: {
            syncId: parentCol.syncId,
            ...(parentCol.workspaceSyncId
              ? { parentSyncId: parentCol.workspaceSyncId }
              : {}),
            name: parentCol.name,
            order: parentCol.order,
            updatedAt: now,
            deletedAt: null,
          },
          createdAt: now,
        },
      ];

      await mutateWithOutbox(async () => {
        await db.collectionTabs.bulkUpdate(
          tabsToRemove.map((tab) => ({
            key: tab.id!,
            changes: { deletedAt: now, updatedAt: now },
          })),
        );
        await db.tabCollections.update(collectionId, { updatedAt: now });
      }, ops);
    } catch (err) {
      console.error("[store] failed to dedupe collection:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(collectionId, prevTabs);
      set({ tabsByCollection: revertMap });
      throw err;
    }
  },
```

- [ ] **Step 5: Type-check and lint**

Run: `pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/stores/app-store.ts
git commit -m "feat(extension): add dedup compute + apply store actions"
```

---

## Task 8: Add i18n strings

**Files:**
- Modify: `apps/extension/src/locales/en.json`
- Modify: `apps/extension/src/locales/zh.json`

- [ ] **Step 1: Add English keys**

In `apps/extension/src/locales/en.json`, locate `"collection_card": { ... }` and add:

```json
    "sort": "Sort tabs",
    "sort_disabled": "Need at least 2 tabs to sort",
    "sort_by_label": "Sort tabs by",
    "sort_by_title": "Title",
    "sort_by_domain": "Domain",
    "sort_by_date_added": "Date added",
    "sort_order_label": "Order",
    "sort_order_asc": "Asc",
    "sort_order_desc": "Desc",
    "sort_apply": "Apply sort",
    "sort_reverse": "Reverse current order",
    "dedupe": "Remove duplicate tabs",
    "dedupe_disabled": "Need at least 2 tabs to dedupe",
    "dedupe_toast_none": "No duplicates found"
```

Also add a new top-level section for the dialog:

```json
  "dedupe_dialog": {
    "title": "Remove duplicate tabs",
    "description": "Keeping the earliest copy of each URL.",
    "summary": "Will remove {{count}} tabs across {{urlCount}} URLs",
    "summary_one": "Will remove 1 tab across 1 URL",
    "per_url_count": "{{count}} → 1",
    "cancel": "Cancel",
    "confirm": "Remove {{count}} tabs",
    "confirm_one": "Remove 1 tab"
  }
```

- [ ] **Step 2: Add the same keys to `zh.json` with Chinese translations**

Inside `"collection_card": { ... }`:

```json
    "sort": "排序标签",
    "sort_disabled": "至少需要 2 个标签才能排序",
    "sort_by_label": "按以下方式排序",
    "sort_by_title": "标题",
    "sort_by_domain": "域名",
    "sort_by_date_added": "加入时间",
    "sort_order_label": "顺序",
    "sort_order_asc": "升序",
    "sort_order_desc": "降序",
    "sort_apply": "应用排序",
    "sort_reverse": "反转当前顺序",
    "dedupe": "移除重复标签",
    "dedupe_disabled": "至少需要 2 个标签才能去重",
    "dedupe_toast_none": "没有发现重复项"
```

And add:

```json
  "dedupe_dialog": {
    "title": "移除重复标签",
    "description": "每组重复的 URL 保留最早加入的一个。",
    "summary": "将移除 {{count}} 个标签，涉及 {{urlCount}} 个 URL",
    "summary_one": "将移除 1 个标签，涉及 1 个 URL",
    "per_url_count": "{{count}} → 1",
    "cancel": "取消",
    "confirm": "移除 {{count}} 个标签",
    "confirm_one": "移除 1 个标签"
  }
```

- [ ] **Step 3: Verify JSON parses (no trailing commas, matching braces)**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('apps/extension/src/locales/en.json','utf8')); JSON.parse(require('node:fs').readFileSync('apps/extension/src/locales/zh.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/locales/en.json apps/extension/src/locales/zh.json
git commit -m "feat(extension): add i18n strings for sort and dedupe"
```

---

## Task 9: Build the `CollectionSortMenu` component

**Files:**
- Create: `apps/extension/src/components/collection/collection-sort-menu.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Button } from "@opentab/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@opentab/ui/components/popover";
import { ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SortDirection, SortKey } from "@/lib/collection-sort";
import { cn } from "@opentab/ui/lib/utils";

interface CollectionSortMenuProps {
  disabled?: boolean;
  onApply: (key: Exclude<SortKey, "reverse">, direction: SortDirection) => void;
  onReverse: () => void;
}

export function CollectionSortMenu({
  disabled,
  onApply,
  onReverse,
}: CollectionSortMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<Exclude<SortKey, "reverse">>("title");
  const [direction, setDirection] = useState<SortDirection>("asc");

  // Reset on each open so sort is never "sticky".
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setKey("title");
      setDirection("asc");
    }
    setOpen(next);
  };

  const handleApply = () => {
    setOpen(false);
    onApply(key, direction);
  };

  const handleReverse = () => {
    setOpen(false);
    onReverse();
  };

  const keys: Array<{ value: Exclude<SortKey, "reverse">; label: string }> = [
    { value: "title", label: t("collection_card.sort_by_title") },
    { value: "domain", label: t("collection_card.sort_by_domain") },
    { value: "dateAdded", label: t("collection_card.sort_by_date_added") },
  ];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          title={
            disabled
              ? t("collection_card.sort_disabled")
              : t("collection_card.sort")
          }
          aria-label={t("collection_card.sort")}
        >
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="px-2 pt-1 pb-2 font-medium text-xs text-muted-foreground">
          {t("collection_card.sort_by_label")}
        </div>
        <div className="flex flex-col gap-0.5" role="radiogroup">
          {keys.map((k) => {
            const selected = key === k.value;
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKey(k.value)}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                  selected && "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-3 items-center justify-center rounded-full border",
                    selected ? "border-primary" : "border-muted-foreground/50",
                  )}
                >
                  {selected && (
                    <span className="size-1.5 rounded-full bg-primary" />
                  )}
                </span>
                {k.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 border-t pt-2">
          <span className="px-2 text-xs text-muted-foreground uppercase tracking-wider">
            {t("collection_card.sort_order_label")}
          </span>
          <div className="ml-auto inline-flex rounded bg-muted p-0.5">
            <button
              type="button"
              className={cn(
                "rounded px-2 py-0.5 text-xs",
                direction === "asc"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setDirection("asc")}
              aria-pressed={direction === "asc"}
            >
              {t("collection_card.sort_order_asc")}
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-2 py-0.5 text-xs",
                direction === "desc"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setDirection("desc")}
              aria-pressed={direction === "desc"}
            >
              {t("collection_card.sort_order_desc")}
            </button>
          </div>
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={handleApply}>
          {t("collection_card.sort_apply")}
        </Button>
        <div className="my-2 border-t" />
        <button
          type="button"
          onClick={handleReverse}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          {t("collection_card.sort_reverse")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/components/collection/collection-sort-menu.tsx
git commit -m "feat(extension): add CollectionSortMenu popover component"
```

---

## Task 10: Build the `DedupConfirmDialog` component

**Files:**
- Create: `apps/extension/src/components/collection/dedup-confirm-dialog.tsx`

- [ ] **Step 1: Create the dialog**

```tsx
import { Button } from "@opentab/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@opentab/ui/components/dialog";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { TabFavicon } from "@/components/tab-favicon";
import type { DedupResult } from "@/lib/collection-dedup";

interface DedupConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: DedupResult | null;
  onConfirm: () => void;
}

export function DedupConfirmDialog({
  open,
  onOpenChange,
  result,
  onConfirm,
}: DedupConfirmDialogProps) {
  const { t } = useTranslation();
  const triggerBlockerRef = useRef<HTMLDivElement>(null);

  if (!result || result.removedCount === 0) return null;

  const summaryKey =
    result.removedCount === 1 && result.affectedUrls.length === 1
      ? "dedupe_dialog.summary_one"
      : "dedupe_dialog.summary";

  const confirmKey =
    result.removedCount === 1 ? "dedupe_dialog.confirm_one" : "dedupe_dialog.confirm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(e) => {
          // Keep focus from bouncing back to the dedupe trigger button, which
          // would cause an aria-hidden warning while the dropdown animates out.
          if (triggerBlockerRef.current) {
            e.preventDefault();
            triggerBlockerRef.current.focus();
          }
        }}
      >
        <div ref={triggerBlockerRef} tabIndex={-1} />
        <DialogHeader>
          <DialogTitle>{t("dedupe_dialog.title")}</DialogTitle>
          <DialogDescription>{t("dedupe_dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-600 text-sm dark:text-amber-400">
          {t(summaryKey, {
            count: result.removedCount,
            urlCount: result.affectedUrls.length,
          })}
        </div>
        <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-1">
          {result.affectedUrls.map((group) => (
            <div
              key={group.url}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"
            >
              <TabFavicon url={group.favIconUrl} size="sm" />
              <span className="flex-1 truncate font-mono text-muted-foreground">
                {group.url}
              </span>
              <span className="shrink-0 font-semibold text-amber-600 dark:text-amber-400">
                {t("dedupe_dialog.per_url_count", { count: group.originalCount })}
              </span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("dedupe_dialog.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t(confirmKey, { count: result.removedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/components/collection/dedup-confirm-dialog.tsx
git commit -m "feat(extension): add DedupConfirmDialog"
```

---

## Task 11: Wire buttons into `CollectionCard`

**Files:**
- Modify: `apps/extension/src/components/collection/collection-card.tsx`

- [ ] **Step 1: Add imports at the top of the file**

In the existing `lucide-react` import block (currently `ArrowRightLeft, ChevronRight, EllipsisVertical, ExternalLink, GripVertical, Pencil, Trash2`), add `Copy` — final block alphabetised:

```tsx
import {
  ArrowRightLeft,
  ChevronRight,
  Copy,
  EllipsisVertical,
  ExternalLink,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
```

Add these four new imports below the existing imports (just before `import { useAppStore }`):

```tsx
import { CollectionSortMenu } from "@/components/collection/collection-sort-menu";
import { DedupConfirmDialog } from "@/components/collection/dedup-confirm-dialog";
import type { DedupResult } from "@/lib/collection-dedup";
import { toast } from "sonner";
```

Biome's `organizeImports` will reorder these at save; follow its output.

- [ ] **Step 2: Add local state for dedup dialog near the top of the component body**

After the existing `useState` calls:

```tsx
const [dedupResult, setDedupResult] = useState<DedupResult | null>(null);
const [dedupOpen, setDedupOpen] = useState(false);
```

- [ ] **Step 3: Pull the new store actions near existing `useAppStore` hooks**

```tsx
const sortCollectionTabs = useAppStore((s) => s.sortCollectionTabs);
const computeCollectionDuplicates = useAppStore((s) => s.computeCollectionDuplicates);
const applyCollectionDedup = useAppStore((s) => s.applyCollectionDedup);
```

- [ ] **Step 4: Add handlers right after those hooks**

```tsx
const canMaintain = tabs.length >= 2;

const handleSort = (
  key: Exclude<import("@/lib/collection-sort").SortKey, "reverse">,
  direction: import("@/lib/collection-sort").SortDirection,
) => {
  if (collection.id == null) return;
  void sortCollectionTabs(collection.id, key, direction);
};

const handleReverse = () => {
  if (collection.id == null) return;
  void sortCollectionTabs(collection.id, "reverse", "asc");
};

const handleDedupeClick = () => {
  if (collection.id == null) return;
  const result = computeCollectionDuplicates(collection.id);
  if (result.removedCount === 0) {
    toast.info(t("collection_card.dedupe_toast_none"));
    return;
  }
  setDedupResult(result);
  setDedupOpen(true);
};

const handleDedupeConfirm = async () => {
  if (collection.id == null || !dedupResult) return;
  setDedupOpen(false);
  try {
    await applyCollectionDedup(collection.id, dedupResult);
  } finally {
    setDedupResult(null);
  }
};
```

- [ ] **Step 5: Insert the two new buttons with separators in the hover-visible action row**

Find the `<div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">` block (around line 208). Reorder its children to:

```tsx
<AddTabPopover onAdd={handleAddUrl} />
{tabs.length > 0 && (
  <Button
    variant="ghost"
    size="icon-xs"
    onClick={handleOpenAll}
    title={t("collection_card.open_all")}
  >
    <ExternalLink className="size-3.5 text-muted-foreground" />
  </Button>
)}

{/* Content maintenance group */}
<div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
<CollectionSortMenu
  disabled={!canMaintain}
  onApply={handleSort}
  onReverse={handleReverse}
/>
<Button
  variant="ghost"
  size="icon-xs"
  onClick={handleDedupeClick}
  disabled={!canMaintain}
  title={
    canMaintain
      ? t("collection_card.dedupe")
      : t("collection_card.dedupe_disabled")
  }
  aria-label={t("collection_card.dedupe")}
>
  <Copy className="size-3.5 text-muted-foreground" />
</Button>
<div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

<Tooltip>
  {/* ...existing Move button Tooltip wrapper unchanged... */}
</Tooltip>
<Button
  {/* ...existing Delete button unchanged... */}
/>
<DropdownMenu>
  {/* ...existing ellipsis menu unchanged... */}
</DropdownMenu>
```

Only the two separators and the two new buttons are added; everything else stays in its original order.

- [ ] **Step 6: Render the dedup dialog near the end of the component JSX (still inside the card)**

Just before the component's closing tag (outside the header but inside the card root):

```tsx
<DedupConfirmDialog
  open={dedupOpen}
  onOpenChange={(next) => {
    setDedupOpen(next);
    if (!next) setDedupResult(null);
  }}
  result={dedupResult}
  onConfirm={handleDedupeConfirm}
/>
```

- [ ] **Step 7: Type-check and lint**

Run: `pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension lint`
Expected: both exit 0.

- [ ] **Step 8: Full test run**

Run: `pnpm --filter @opentab/extension test`
Expected: all sort + dedup tests still pass (no UI tests were added).

- [ ] **Step 9: Commit**

```bash
git add apps/extension/src/components/collection/collection-card.tsx
git commit -m "feat(extension): wire sort menu and dedup dialog into collection card"
```

---

## Task 12: Manual QA and polish

**Files:** none — this is runtime verification.

- [ ] **Step 1: Start the extension dev server**

Run: `pnpm --filter @opentab/extension dev`
Then load unpacked from `apps/extension/.output/chrome-mv3/` in `chrome://extensions/`.

- [ ] **Step 2: Seed a test collection**

Open the OpenTab page, create a workspace + collection. Save several browser tabs with varied titles (e.g. mix of English/numbers/Chinese), varied domains, and include at least three exact-duplicate URLs spread in time.

- [ ] **Step 3: Verify sort button states**

- [ ] New collection with 0 tabs → Sort and Dedupe both disabled (cursor reflects).
- [ ] Collection with 1 tab → still disabled.
- [ ] Collection with 2+ tabs → both enabled.

- [ ] **Step 4: Verify each sort permutation visually**

- [ ] Title Asc / Desc — expected alphabetic order; tabs with empty title move to the end.
- [ ] Domain Asc / Desc — same-domain tabs clump together.
- [ ] Date added Asc / Desc — older / newer first.
- [ ] Reverse — current visible order flips.
- [ ] Reopen menu after applying — it resets to Title + Asc every time.

- [ ] **Step 5: Verify dedup happy path**

- [ ] Click Dedupe on a collection with known duplicates → dialog opens with correct counts and list.
- [ ] Cancel → no changes.
- [ ] Confirm → duplicates gone; earliest copy of each URL remains; toast does NOT fire (dialog did).

- [ ] **Step 6: Verify dedup "no duplicates" path**

- [ ] Click Dedupe on a collection with no duplicates → no dialog, toast says "No duplicates found".

- [ ] **Step 7: Verify persistence**

- [ ] Reload the extension page — sorted order and removed tabs stay.
- [ ] Open Chrome devtools → Application → IndexedDB → `OpenTabDB` → `collectionTabs`: removed tabs have `deletedAt` set.

- [ ] **Step 8: Verify sync outbox (if server sync enabled)**

- [ ] Same IndexedDB panel → `syncOutbox` table → pending ops exist for sort (N updates) or dedupe (M deletes + 1 collection update).
- [ ] If a server is running and extension is signed in, wait a few seconds — ops transition to `synced`.

- [ ] **Step 9: Verify keyboard & focus behavior**

- [ ] Open sort menu with mouse → Esc closes it.
- [ ] Open dedup dialog → Esc closes, confirm/cancel buttons keyboard-accessible.
- [ ] No `aria-hidden` console warnings after closing the dedup dialog.

- [ ] **Step 10: Verify i18n**

- [ ] Switch extension language to Chinese → all new labels translated.

- [ ] **Step 11: If any issue found, file it as a follow-up commit**

For bugs found in manual QA, fix with small focused commits following the style:

```bash
git commit -m "fix(extension): <specific issue>"
```

- [ ] **Step 12: Final commit (if any cleanup / no-op verification)**

No final commit needed if everything passed. Otherwise commit any doc updates or polish.

---

## Deliberate Scope Reductions

The spec mentioned Dexie-backed integration tests for the store actions. This plan intentionally skips them and relies on:

1. **Unit tests** over the pure logic — where the interesting behavior lives (comparators, empty-key placement, stable sort, grouping, earliest-kept).
2. **Manual QA** (Task 12) — covers the store + outbox + UI path end-to-end.

Reason: the extension currently has zero test infrastructure for Dexie/IndexedDB. Adding `fake-indexeddb` plus test fixtures for workspaces/collections just to test two thin glue actions is more scaffolding than signal. If the team later invests in a general integration harness, the store actions are simple enough to retrofit tests for.

If you disagree, the fix is: add `fake-indexeddb` as a devDep, create a `src/stores/app-store.test.ts` that seeds a collection + tabs and asserts `tabsByCollection` + `syncOutbox` contents after each new action — insert that as a task between Task 7 and Task 8.

---

## Done-When

- [ ] All 12 tasks completed.
- [ ] `pnpm --filter @opentab/extension test` green.
- [ ] `pnpm --filter @opentab/extension check-types` green.
- [ ] `pnpm --filter @opentab/extension lint` green.
- [ ] Manual QA checklist above passes on a real browser.
- [ ] Spec file and design decisions all reflected (no spec requirement is missing a task).
