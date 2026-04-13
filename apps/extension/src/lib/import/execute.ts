import Dexie from "dexie";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/lib/db";
import { bulkMutateWithOutbox, type SyncOpInput } from "@/lib/mutate-with-outbox";
import { resolveAccountId } from "@/lib/resolve-account-id";
import type { ImportPlan, ImportTab } from "./types";

export interface ImportResult {
  workspaceCount: number;
  collectionCount: number;
  tabCount: number;
}

async function getLastOrder(
  table: "workspaces" | "tabCollections" | "collectionTabs",
  parentKey?: { field: string; value: number },
): Promise<string | null> {
  let last: { order: string } | undefined;
  if (parentKey) {
    const indexName = table === "tabCollections" ? "[workspaceId+order]" : "[collectionId+order]";
    last = await db
      .table(table)
      .where(indexName)
      .between([parentKey.value, Dexie.minKey], [parentKey.value, Dexie.maxKey])
      .last();
  } else {
    last = await db.table(table).orderBy("order").last();
  }
  return last?.order ?? null;
}

async function addTabsToCollection(
  collectionId: number,
  collectionSyncId: string,
  tabs: ImportTab[],
  ops: SyncOpInput[],
): Promise<void> {
  let lastOrder = await getLastOrder("collectionTabs", {
    field: "collectionId",
    value: collectionId,
  });
  const now = Date.now();

  const records = tabs.map((tab) => {
    const order = generateKeyBetween(lastOrder, null);
    lastOrder = order;
    return {
      collectionId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      order,
      syncId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
  });

  await db.collectionTabs.bulkAdd(records);

  for (const rec of records) {
    ops.push({
      opId: crypto.randomUUID(),
      entityType: "tab",
      entitySyncId: rec.syncId,
      action: "create",
      payload: {
        syncId: rec.syncId,
        parentSyncId: collectionSyncId,
        url: rec.url,
        title: rec.title,
        favIconUrl: rec.favIconUrl,
        order: rec.order,
        updatedAt: rec.updatedAt,
        deletedAt: null,
      },
      createdAt: now,
    });
  }
}

export async function executeImport(plan: ImportPlan): Promise<ImportResult> {
  const accountId = await resolveAccountId();
  let workspaceCount = 0;
  let collectionCount = 0;
  let tabCount = 0;

  const ops: SyncOpInput[] = [];

  await bulkMutateWithOutbox(async () => {
    for (const wsPlan of plan.workspaces) {
      if (!wsPlan.selected) continue;

      let wsId: number;
      let wsSyncId: string;
      if (wsPlan.existingWorkspaceId != null) {
        wsId = wsPlan.existingWorkspaceId;
        const existingWs = await db.workspaces.get(wsId);
        wsSyncId = existingWs!.syncId;
      } else {
        const lastWsOrder = await getLastOrder("workspaces");
        const now = Date.now();
        const newOrder = generateKeyBetween(lastWsOrder, null);
        const syncId = crypto.randomUUID();
        wsId = (await db.workspaces.add({
          accountId,
          name: wsPlan.name,
          icon: wsPlan.icon ?? "folder",
          order: newOrder,
          syncId,
          createdAt: now,
          updatedAt: now,
        })) as number;
        wsSyncId = syncId;
        workspaceCount++;

        ops.push({
          opId: crypto.randomUUID(),
          entityType: "workspace",
          entitySyncId: syncId,
          action: "create",
          payload: {
            syncId,
            name: wsPlan.name,
            icon: wsPlan.icon ?? "folder",
            order: newOrder,
            updatedAt: now,
            deletedAt: null,
          },
          createdAt: now,
        });
      }

      // Get last collection order once, then chain locally to avoid
      // relying on Dexie reading its own writes within the transaction.
      let lastColOrder = await getLastOrder("tabCollections", {
        field: "workspaceId",
        value: wsId,
      });

      for (const colPlan of wsPlan.collections) {
        if (!colPlan.selected || colPlan.strategy === "skip") continue;

        if (colPlan.strategy === "new" || colPlan.existingCollectionId == null) {
          const order = generateKeyBetween(lastColOrder, null);
          lastColOrder = order;
          const now = Date.now();
          const colSyncId = crypto.randomUUID();
          const colId = (await db.tabCollections.add({
            workspaceId: wsId,
            name: colPlan.name,
            order,
            syncId: colSyncId,
            createdAt: now,
            updatedAt: now,
          })) as number;
          collectionCount++;

          ops.push({
            opId: crypto.randomUUID(),
            entityType: "collection",
            entitySyncId: colSyncId,
            action: "create",
            payload: {
              syncId: colSyncId,
              parentSyncId: wsSyncId,
              name: colPlan.name,
              order,
              updatedAt: now,
              deletedAt: null,
            },
            createdAt: now,
          });

          await addTabsToCollection(colId, colSyncId, colPlan.allTabs, ops);
          tabCount += colPlan.allTabs.length;
        } else {
          // Merge into existing collection
          let merged = false;

          // Look up existing collection's syncId for tab ops
          const existingCol = await db.tabCollections.get(colPlan.existingCollectionId);
          const colSyncId = existingCol!.syncId;

          if (colPlan.toAdd.length > 0) {
            await addTabsToCollection(colPlan.existingCollectionId, colSyncId, colPlan.toAdd, ops);
            tabCount += colPlan.toAdd.length;
            merged = true;
          }

          // Soft-delete extra existing tabs user chose to remove
          const toDeleteEntries = colPlan.extraExisting.filter((t) => t.decision === "delete");
          if (toDeleteEntries.length > 0) {
            const now = Date.now();
            const toDeleteIds = toDeleteEntries.map((t) => t.id);
            // Look up syncIds before modifying
            const tabsToDelete = await db.collectionTabs.where("id").anyOf(toDeleteIds).toArray();
            await db.collectionTabs
              .where("id")
              .anyOf(toDeleteIds)
              .modify({ deletedAt: now, updatedAt: now });

            for (const tab of tabsToDelete) {
              ops.push({
                opId: crypto.randomUUID(),
                entityType: "tab",
                entitySyncId: tab.syncId,
                action: "delete",
                payload: { syncId: tab.syncId, updatedAt: now },
                createdAt: now,
              });
            }
            merged = true;
          }

          // Apply metadata updates (newer title/favIconUrl from import)
          if (colPlan.metadataUpdates.length > 0) {
            for (const update of colPlan.metadataUpdates) {
              const now = Date.now();
              await db.collectionTabs.update(update.existingTabId, {
                title: update.title,
                favIconUrl: update.favIconUrl,
                updatedAt: now,
              });
              // Look up the tab's syncId for the update op
              const tab = await db.collectionTabs.get(update.existingTabId);
              if (tab) {
                ops.push({
                  opId: crypto.randomUUID(),
                  entityType: "tab",
                  entitySyncId: tab.syncId,
                  action: "update",
                  payload: {
                    syncId: tab.syncId,
                    parentSyncId: colSyncId,
                    url: tab.url,
                    title: update.title,
                    favIconUrl: update.favIconUrl,
                    order: tab.order,
                    updatedAt: now,
                    deletedAt: null,
                  },
                  createdAt: now,
                });
              }
            }
            merged = true;
          }

          // Bump collection updatedAt and count
          if (merged) {
            await db.tabCollections.update(colPlan.existingCollectionId, {
              updatedAt: Date.now(),
            });
            collectionCount++;
          }
        }
      }
    }
  }, ops);

  return { workspaceCount, collectionCount, tabCount };
}
