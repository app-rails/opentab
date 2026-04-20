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
 * Tabs without an id are ignored.
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
