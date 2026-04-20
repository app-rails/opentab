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

function nullableCompare<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number): number {
  const aEmpty = a === null || a === "";
  const bEmpty = b === null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
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

function isEmptyKey(tab: CollectionTab, key: Exclude<SortKey, "reverse">): boolean {
  if (key === "title") return !tab.title;
  if (key === "domain") return hostnameOrNull(tab.url) === null;
  return false;
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
  return tabs
    .map((tab, idx) => ({ tab, idx }))
    .sort((a, b) => {
      // Empties must always be last regardless of direction.
      const aKeyEmpty = isEmptyKey(a.tab, key);
      const bKeyEmpty = isEmptyKey(b.tab, key);
      if (aKeyEmpty !== bKeyEmpty) return aKeyEmpty ? 1 : -1;
      const raw = cmp(a.tab, b.tab);
      if (raw !== 0) return sign * raw;
      return a.idx - b.idx;
    })
    .map((entry) => entry.tab);
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
