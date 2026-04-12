import Dexie from "dexie";
import { db } from "./db";

export function activeWorkspaces(accountId: string) {
  return db.workspaces
    .where("[accountId+order]")
    .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
    .filter((w) => !w.deletedAt);
}

export function activeCollections(workspaceId: number) {
  return db.tabCollections
    .where("[workspaceId+order]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .filter((c) => !c.deletedAt);
}

export function activeTabs(collectionId: number) {
  return db.collectionTabs
    .where("[collectionId+order]")
    .between([collectionId, Dexie.minKey], [collectionId, Dexie.maxKey])
    .filter((t) => !t.deletedAt);
}

export function activeTabsForSearch() {
  return db.collectionTabs.filter((t) => !t.deletedAt);
}
