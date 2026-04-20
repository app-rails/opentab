import { generateKeyBetween } from "fractional-indexing";
import type { CollectionTab } from "@/lib/db";

export type SortKey = "title" | "domain" | "dateAdded" | "reverse";
export type SortDirection = "asc" | "desc";

function hostnameOrNull(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

interface Decorated {
  tab: CollectionTab;
  idx: number;
  sortKey: string | null;
}

function decorate(tabs: CollectionTab[], key: Exclude<SortKey, "reverse">): Decorated[] {
  return tabs.map((tab, idx) => {
    let sortKey: string | null;
    if (key === "title") sortKey = tab.title || null;
    else if (key === "domain") sortKey = hostnameOrNull(tab.url);
    else sortKey = String(tab.createdAt);
    return { tab, idx, sortKey };
  });
}

function compareDecorated(a: Decorated, b: Decorated, key: Exclude<SortKey, "reverse">): number {
  if (key === "dateAdded") return a.tab.createdAt - b.tab.createdAt;
  if (key === "title") {
    return (a.sortKey as string).localeCompare(b.sortKey as string, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }
  return (a.sortKey as string).localeCompare(b.sortKey as string);
}

/**
 * Returns a new array of tabs in the target order. Input order is preserved
 * for tiebreakers so the sort is stable. For `key === "reverse"`, returns the
 * input reversed (direction is ignored). Empty/invalid keys (empty title,
 * unparseable URL) always sort last regardless of direction.
 */
export function sortTabs(
  tabs: CollectionTab[],
  key: SortKey,
  direction: SortDirection,
): CollectionTab[] {
  if (key === "reverse") {
    return [...tabs].reverse();
  }
  const sign = direction === "desc" ? -1 : 1;
  return decorate(tabs, key)
    .sort((a, b) => {
      const aEmpty = a.sortKey === null;
      const bEmpty = b.sortKey === null;
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (aEmpty) return a.idx - b.idx;
      const raw = compareDecorated(a, b, key);
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
