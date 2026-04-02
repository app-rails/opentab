import Dexie from "dexie";
import { db } from "@/lib/db";

export async function exportAllData(): Promise<void> {
  const workspaces = await db.workspaces.orderBy("order").toArray();

  const exportData = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    workspaces: await Promise.all(
      workspaces.map(async (ws) => {
        const collections = await db.tabCollections
          .where("[workspaceId+order]")
          .between([ws.id!, Dexie.minKey], [ws.id!, Dexie.maxKey])
          .toArray();

        return {
          id: ws.id!,
          name: ws.name,
          icon: ws.icon,
          order: ws.order,
          ...(ws.viewMode != null && { viewMode: ws.viewMode }),
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
          collections: await Promise.all(
            collections.map(async (col) => {
              const tabs = await db.collectionTabs
                .where("[collectionId+order]")
                .between([col.id!, Dexie.minKey], [col.id!, Dexie.maxKey])
                .toArray();

              return {
                id: col.id!,
                name: col.name,
                order: col.order,
                createdAt: col.createdAt,
                updatedAt: col.updatedAt,
                tabs: tabs.map((tab) => ({
                  id: tab.id!,
                  url: tab.url,
                  title: tab.title,
                  ...(tab.favIconUrl != null && { favIconUrl: tab.favIconUrl }),
                  order: tab.order,
                  createdAt: tab.createdAt,
                  updatedAt: tab.updatedAt,
                })),
              };
            }),
          ),
        };
      }),
    ),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const downloadId = await chrome.downloads.download({
    url,
    filename: `opentab-backup-${new Date().toISOString().slice(0, 10)}.json`,
    saveAs: true,
  });
  // Revoke after download completes or fails, not immediately
  chrome.downloads.onChanged.addListener(function listener(delta) {
    if (delta.id === downloadId && delta.state?.current !== "in_progress") {
      URL.revokeObjectURL(url);
      chrome.downloads.onChanged.removeListener(listener);
    }
  });
}
