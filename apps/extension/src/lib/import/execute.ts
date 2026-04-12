import Dexie from "dexie";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/lib/db";
import { resolveAccountId } from "@/stores/app-store";
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

async function addTabsToCollection(collectionId: number, tabs: ImportTab[]): Promise<void> {
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
}

export async function executeImport(plan: ImportPlan): Promise<ImportResult> {
  const accountId = await resolveAccountId();
  let workspaceCount = 0;
  let collectionCount = 0;
  let tabCount = 0;

  await db.transaction("rw", [db.workspaces, db.tabCollections, db.collectionTabs], async () => {
    for (const wsPlan of plan.workspaces) {
      if (!wsPlan.selected) continue;

      let wsId: number;
      if (wsPlan.existingWorkspaceId != null) {
        wsId = wsPlan.existingWorkspaceId;
      } else {
        const lastWsOrder = await getLastOrder("workspaces");
        const now = Date.now();
        wsId = (await db.workspaces.add({
          accountId,
          name: wsPlan.name,
          icon: wsPlan.icon ?? "folder",
          order: generateKeyBetween(lastWsOrder, null),
          syncId: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        })) as number;
        workspaceCount++;
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
          const colId = (await db.tabCollections.add({
            workspaceId: wsId,
            name: colPlan.name,
            order,
            syncId: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          })) as number;
          collectionCount++;

          await addTabsToCollection(colId, colPlan.allTabs);
          tabCount += colPlan.allTabs.length;
        } else {
          // Merge into existing collection
          let merged = false;

          if (colPlan.toAdd.length > 0) {
            await addTabsToCollection(colPlan.existingCollectionId, colPlan.toAdd);
            tabCount += colPlan.toAdd.length;
            merged = true;
          }

          // Delete extra existing tabs user chose to remove
          const toDeleteIds = colPlan.extraExisting
            .filter((t) => t.decision === "delete")
            .map((t) => t.id);
          if (toDeleteIds.length > 0) {
            await db.collectionTabs.bulkDelete(toDeleteIds);
            merged = true;
          }

          // Apply metadata updates (newer title/favIconUrl from import)
          if (colPlan.metadataUpdates.length > 0) {
            for (const update of colPlan.metadataUpdates) {
              await db.collectionTabs.update(update.existingTabId, {
                title: update.title,
                favIconUrl: update.favIconUrl,
                updatedAt: Date.now(),
              });
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
  });

  return { workspaceCount, collectionCount, tabCount };
}
