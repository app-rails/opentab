import { generateKeyBetween } from "fractional-indexing";
import Dexie from "dexie";
import { db } from "@/lib/db";
import { resolveAccountId } from "@/stores/app-store";
import type { ImportPlan, ImportTab, MetadataUpdate } from "./types";

export interface ImportResult {
  workspaceCount: number;
  collectionCount: number;
  tabCount: number;
}

async function getLastOrder(
  table: "workspaces" | "tabCollections" | "collectionTabs",
  parentKey?: { field: string; value: number },
): Promise<string | null> {
  let last;
  if (parentKey) {
    const indexName =
      table === "tabCollections" ? "[workspaceId+order]" : "[collectionId+order]";
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

  await db.transaction(
    "rw",
    [db.workspaces, db.tabCollections, db.collectionTabs],
    async () => {
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
            createdAt: now,
            updatedAt: now,
          })) as number;
          workspaceCount++;
        }

        for (const colPlan of wsPlan.collections) {
          if (!colPlan.selected || colPlan.strategy === "skip") continue;

          if (colPlan.strategy === "new" || colPlan.existingCollectionId == null) {
            const lastColOrder = await getLastOrder("tabCollections", {
              field: "workspaceId",
              value: wsId,
            });
            const now = Date.now();
            const colId = (await db.tabCollections.add({
              workspaceId: wsId,
              name: colPlan.name,
              order: generateKeyBetween(lastColOrder, null),
              createdAt: now,
              updatedAt: now,
            })) as number;
            collectionCount++;

            await addTabsToCollection(colId, colPlan.allTabs);
            tabCount += colPlan.allTabs.length;
          } else {
            // Merge into existing collection
            if (colPlan.toAdd.length > 0) {
              await addTabsToCollection(colPlan.existingCollectionId, colPlan.toAdd);
              tabCount += colPlan.toAdd.length;
              collectionCount++;
            }

            // Delete extra existing tabs user chose to remove
            const toDeleteIds = colPlan.extraExisting
              .filter((t) => t.decision === "delete")
              .map((t) => t.id);
            if (toDeleteIds.length > 0) {
              await db.collectionTabs.bulkDelete(toDeleteIds);
            }

            // Apply metadata updates (newer title/favIconUrl from import)
            for (const update of colPlan.metadataUpdates) {
              await db.collectionTabs.update(update.existingTabId, {
                title: update.title,
                favIconUrl: update.favIconUrl,
                updatedAt: Date.now(),
              });
            }

            // Bump collection updatedAt
            if (colPlan.toAdd.length > 0 || toDeleteIds.length > 0 || colPlan.metadataUpdates.length > 0) {
              await db.tabCollections.update(colPlan.existingCollectionId, {
                updatedAt: Date.now(),
              });
            }
          }
        }
      }
    },
  );

  return { workspaceCount, collectionCount, tabCount };
}
