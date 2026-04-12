import { MSG } from "./constants";
import { db, type SyncOp } from "./db";

export type SyncOpInput = Omit<
  SyncOp,
  "id" | "status" | "attemptCount" | "lastError" | "nextRetryAt" | "syncedAt"
>;

export async function mutateWithOutbox(
  mutations: () => Promise<void>,
  ops: SyncOpInput[],
): Promise<void> {
  await db.transaction(
    "rw",
    [db.workspaces, db.tabCollections, db.collectionTabs, db.syncOutbox],
    async () => {
      await mutations();
      for (const op of ops) {
        await db.syncOutbox.add({
          ...op,
          status: "pending",
          attemptCount: 0,
          lastError: null,
          nextRetryAt: null,
          syncedAt: null,
        });
      }
    },
  );
  // Notify background to sync
  chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {
    // Background may not be listening yet
  });
}

export async function bulkMutateWithOutbox(
  mutations: () => Promise<void>,
  ops: SyncOpInput[],
): Promise<void> {
  await db.transaction(
    "rw",
    [db.workspaces, db.tabCollections, db.collectionTabs, db.syncOutbox],
    async () => {
      await mutations();
      if (ops.length > 0) {
        await db.syncOutbox.bulkAdd(
          ops.map((op) => ({
            ...op,
            status: "pending" as const,
            attemptCount: 0,
            lastError: null,
            nextRetryAt: null,
            syncedAt: null,
          })),
        );
      }
    },
  );
  chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {});
}
