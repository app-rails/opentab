import Dexie from "dexie";
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
import { db } from "@/lib/db";
import type {
  CollectionDiff,
  DiffResult,
  ExistingTab,
  ImportData,
  ImportTab,
  MetadataUpdate,
  WorkspaceDiff,
} from "./types";

function buildUrlMultiset(tabs: { url: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tab of tabs) {
    map.set(tab.url, (map.get(tab.url) ?? 0) + 1);
  }
  return map;
}

function diffCollectionTabs(
  existingTabs: CollectionTab[],
  incomingTabs: ImportTab[],
): {
  toAdd: ImportTab[];
  extraExisting: ExistingTab[];
  metadataUpdates: MetadataUpdate[];
  unchangedCount: number;
} {
  const existingMultiset = buildUrlMultiset(existingTabs);
  const incomingMultiset = buildUrlMultiset(incomingTabs);

  // Group tabs by URL for picking specific instances
  const incomingByUrl = new Map<string, ImportTab[]>();
  for (const tab of incomingTabs) {
    const group = incomingByUrl.get(tab.url) ?? [];
    group.push(tab);
    incomingByUrl.set(tab.url, group);
  }

  const existingByUrl = new Map<string, CollectionTab[]>();
  for (const tab of existingTabs) {
    const group = existingByUrl.get(tab.url) ?? [];
    group.push(tab);
    existingByUrl.set(tab.url, group);
  }

  // Compute toAdd: for each URL, how many more does incoming have?
  const toAdd: ImportTab[] = [];
  for (const [url, incomingCount] of incomingMultiset) {
    const existingCount = existingMultiset.get(url) ?? 0;
    const addCount = Math.max(0, incomingCount - existingCount);
    if (addCount > 0) {
      const candidates = incomingByUrl.get(url) ?? [];
      toAdd.push(...candidates.slice(candidates.length - addCount));
    }
  }

  // Compute extraExisting: for each URL, how many more does existing have?
  const extraExisting: ExistingTab[] = [];
  for (const [url, existingCount] of existingMultiset) {
    const incomingCount = incomingMultiset.get(url) ?? 0;
    const extraCount = Math.max(0, existingCount - incomingCount);
    if (extraCount > 0) {
      const candidates = existingByUrl.get(url) ?? [];
      for (const tab of candidates.slice(candidates.length - extraCount)) {
        extraExisting.push({
          id: tab.id!,
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          updatedAt: tab.updatedAt,
        });
      }
    }
  }

  // Metadata updates: for matched tabs with newer incoming updatedAt
  const metadataUpdates: MetadataUpdate[] = [];
  for (const [url, existingGroup] of existingByUrl) {
    const incomingGroup = incomingByUrl.get(url);
    if (!incomingGroup) continue;
    const matchCount = Math.min(existingGroup.length, incomingGroup.length);
    for (let i = 0; i < matchCount; i++) {
      const existing = existingGroup[i];
      const incoming = incomingGroup[i];
      if (
        incoming.updatedAt != null &&
        existing.updatedAt != null &&
        incoming.updatedAt > existing.updatedAt &&
        (incoming.title !== existing.title || incoming.favIconUrl !== existing.favIconUrl)
      ) {
        metadataUpdates.push({
          existingTabId: existing.id!,
          title: incoming.title,
          favIconUrl: incoming.favIconUrl,
        });
      }
    }
  }

  const unchangedCount = existingTabs.length - extraExisting.length;

  return { toAdd, extraExisting, metadataUpdates, unchangedCount };
}

async function loadCollectionsForWorkspace(workspaceId: number): Promise<TabCollection[]> {
  return db.tabCollections
    .where("[workspaceId+order]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .filter((c) => !c.deletedAt)
    .toArray();
}

async function loadTabsForCollection(collectionId: number): Promise<CollectionTab[]> {
  return db.collectionTabs
    .where("[collectionId+order]")
    .between([collectionId, Dexie.minKey], [collectionId, Dexie.maxKey])
    .filter((t) => !t.deletedAt)
    .toArray();
}

export async function computeDiff(importData: ImportData): Promise<DiffResult> {
  const existingWorkspaces = await db.workspaces
    .orderBy("order")
    .filter((w) => !w.deletedAt)
    .toArray();

  // Group by name as arrays for one-to-one matching via shift()
  const workspacesByName = new Map<string, Workspace[]>();
  for (const ws of existingWorkspaces) {
    const group = workspacesByName.get(ws.name) ?? [];
    group.push(ws);
    workspacesByName.set(ws.name, group);
  }

  const workspaceDiffs: WorkspaceDiff[] = [];

  for (const importWs of importData.workspaces) {
    const existingWs = workspacesByName.get(importWs.name)?.shift() ?? null;

    if (!existingWs) {
      workspaceDiffs.push({
        name: importWs.name,
        icon: importWs.icon,
        status: "new",
        collections: importWs.collections.map((col) => ({
          name: col.name,
          status: "new" as const,
          toAdd: col.tabs,
          extraExisting: [],
          metadataUpdates: [],
          unchangedCount: 0,
          allTabs: col.tabs,
        })),
      });
      continue;
    }

    const existingCollections = await loadCollectionsForWorkspace(existingWs.id!);
    // Group by name as arrays for one-to-one matching via shift()
    const collectionsByName = new Map<string, TabCollection[]>();
    for (const col of existingCollections) {
      const group = collectionsByName.get(col.name) ?? [];
      group.push(col);
      collectionsByName.set(col.name, group);
    }

    const collectionDiffs: CollectionDiff[] = [];

    for (const importCol of importWs.collections) {
      const existingCol = collectionsByName.get(importCol.name)?.shift() ?? null;

      if (!existingCol) {
        collectionDiffs.push({
          name: importCol.name,
          status: "new",
          toAdd: importCol.tabs,
          extraExisting: [],
          metadataUpdates: [],
          unchangedCount: 0,
          allTabs: importCol.tabs,
        });
        continue;
      }

      const existingTabs = await loadTabsForCollection(existingCol.id!);
      const { toAdd, extraExisting, metadataUpdates, unchangedCount } = diffCollectionTabs(
        existingTabs,
        importCol.tabs,
      );

      if (toAdd.length === 0 && extraExisting.length === 0 && metadataUpdates.length === 0) {
        collectionDiffs.push({
          name: importCol.name,
          status: "same",
          existingCollectionId: existingCol.id,
          toAdd: [],
          extraExisting: [],
          metadataUpdates: [],
          unchangedCount,
          allTabs: importCol.tabs,
        });
      } else {
        collectionDiffs.push({
          name: importCol.name,
          status: "conflict",
          existingCollectionId: existingCol.id,
          toAdd,
          extraExisting,
          metadataUpdates,
          unchangedCount,
          allTabs: importCol.tabs,
        });
      }
    }

    workspaceDiffs.push({
      name: importWs.name,
      icon: importWs.icon,
      status: collectionDiffs.some((c) => c.status !== "same") ? "conflict" : "same",
      existingWorkspaceId: existingWs.id,
      collections: collectionDiffs,
    });
  }

  return { workspaces: workspaceDiffs };
}
