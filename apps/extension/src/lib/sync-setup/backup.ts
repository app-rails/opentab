import { db } from "@/lib/db";
import { activeCollections, activeTabs } from "@/lib/db-queries";

/**
 * Pre-flight local backup (spec §2.4.5, state `backup_running`).
 *
 * Variant of `apps/extension/src/lib/export.ts`'s `exportAllData` — that
 * function prompts the user with `saveAs: true`, which we explicitly DON'T
 * want in the wizard because we need a silent, non-blocking backup before
 * touching the server. Hence the forked serializer + `saveAs: false`.
 *
 * The filename embeds the ISO timestamp down to seconds so multiple wizard
 * runs on the same day don't clobber each other.
 */
export interface BackupResult {
  filename: string;
  downloadId: number;
}

export async function exportLocalBackupToDownloads(): Promise<BackupResult> {
  const workspaces = await db.workspaces
    .orderBy("order")
    .filter((w) => !w.deletedAt)
    .toArray();

  const exportData = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    workspaces: await Promise.all(
      workspaces.map(async (ws) => {
        const collections = await activeCollections(ws.id!).sortBy("order");
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
              const tabs = await activeTabs(col.id!).sortBy("order");
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
  const filename = `opentab-backup-${new Date().toISOString().replace(/:/g, "-")}.json`;

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
    });

    // Revoke after the download finishes (success OR failure) so we don't
    // leak the blob URL. Downloads API fires `onChanged` with `state.current`
    // moving out of `in_progress`.
    chrome.downloads.onChanged.addListener(function listener(delta) {
      if (delta.id === downloadId && delta.state?.current !== "in_progress") {
        URL.revokeObjectURL(url);
        chrome.downloads.onChanged.removeListener(listener);
      }
    });

    return { filename, downloadId };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
