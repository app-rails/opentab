import Dexie from "dexie";
import { generateKeyBetween } from "fractional-indexing";
import { initializeAuth } from "./auth-manager";
import { clearAuthState, getAuthState } from "./auth-storage";
import { MSG } from "./constants";
import type { CollectionTab, SyncOp, TabCollection, Workspace } from "./db";
import { db } from "./db";
import { activeCollections, activeTabs, activeWorkspaces } from "./db-queries";
import { resolveAccountId } from "./resolve-account-id";
import { getSettings } from "./settings";
import { getExtensionTRPCClient } from "./trpc";
import type { ViewMode } from "./view-mode";

// ---------------------------------------------------------------------------
// Types (matching server PullResult.changes shape)
// ---------------------------------------------------------------------------

interface ChangeEntry {
  seq: number;
  entityType: string;
  entitySyncId: string;
  action: string;
  opId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ATTEMPT_COUNT = 20;
const PUSH_DEBOUNCE_MS = 500;
const PUSH_LOOP_TIME_LIMIT = 30_000;
const PUSH_LOOP_BATCH_LIMIT = 10;
const CLEANUP_RETENTION_DAYS = 7;
const CLEANUP_RETENTION_MS = CLEANUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const FULL_RESET_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUnauthorizedError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    // tRPC error shape
    if (e.data && typeof e.data === "object") {
      const data = e.data as Record<string, unknown>;
      if (data.code === "UNAUTHORIZED") return true;
    }
    // TRPCClientError shape
    if (e.message && typeof e.message === "string" && e.message.includes("UNAUTHORIZED"))
      return true;
    if ((e as { shape?: { data?: { code?: string } } }).shape?.data?.code === "UNAUTHORIZED")
      return true;
  }
  return false;
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 300_000);
}

// ---------------------------------------------------------------------------
// SyncEngine
// ---------------------------------------------------------------------------

export class SyncEngine {
  private isSyncing = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- public API -------------------------------------------------------

  /** Check if a sync is needed based on polling interval, then sync. */
  async syncIfNeeded(): Promise<void> {
    const settings = await getSettings();
    if (!settings.server_enabled) return;

    const meta = await db.syncMeta.get("lastSyncAt");
    const lastSyncAt = typeof meta?.value === "number" ? meta.value : 0;
    const now = Date.now();

    if (now - lastSyncAt >= settings.sync_polling_interval) {
      await this.sync();
    }
  }

  /** Debounce 500ms then call sync(). Used by mutateWithOutbox notifications. */
  notifyChange(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.sync().catch((err) => console.error("[sync] notifyChange sync error:", err));
    }, PUSH_DEBOUNCE_MS);
  }

  /** Main sync: push local changes, then pull remote changes. */
  async sync(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      const auth = await getAuthState();
      if (auth?.mode !== "online") return;

      const settings = await getSettings();
      if (!settings.server_enabled) return;

      await this.push();
      const pullCount = await this.pull();

      await db.syncMeta.put({ key: "lastSyncAt", value: Date.now() });

      if (pullCount > 0) {
        this.broadcastSyncApplied();
      }
    } catch (err) {
      console.error("[sync] sync error:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  /** Retry failed outbox ops whose nextRetryAt has expired. */
  async retryFailed(): Promise<void> {
    const now = Date.now();
    const failedOps = await db.syncOutbox
      .where("[status+nextRetryAt]")
      .between(["failed", Dexie.minKey], ["failed", now])
      .toArray();

    for (const op of failedOps) {
      if (op.attemptCount >= MAX_ATTEMPT_COUNT) {
        await db.syncOutbox.update(op.id!, { status: "dead" });
        continue;
      }

      try {
        const trpc = await this.getTRPC();
        await trpc.sync.push.mutate({
          ops: [
            {
              opId: op.opId,
              entityType: op.entityType,
              entitySyncId: op.entitySyncId,
              action: op.action,
              payload: op.payload as never,
              timestamp: op.createdAt,
            },
          ],
        });
        await db.syncOutbox.update(op.id!, { status: "synced", syncedAt: Date.now() });
      } catch (err) {
        const newAttempt = op.attemptCount + 1;
        if (newAttempt >= MAX_ATTEMPT_COUNT) {
          await db.syncOutbox.update(op.id!, {
            status: "dead",
            attemptCount: newAttempt,
            lastError: String(err),
          });
        } else {
          await db.syncOutbox.update(op.id!, {
            attemptCount: newAttempt,
            lastError: String(err),
            nextRetryAt: Date.now() + backoffMs(newAttempt),
          });
        }
      }
    }
  }

  /** Delete old synced/dead outbox entries. */
  async cleanupOutbox(): Promise<void> {
    const cutoff = Date.now() - CLEANUP_RETENTION_MS;

    // Delete synced ops older than 7 days
    const syncedOld = await db.syncOutbox
      .where("[status+syncedAt]")
      .between(["synced", Dexie.minKey], ["synced", cutoff])
      .primaryKeys();
    if (syncedOld.length > 0) {
      await db.syncOutbox.bulkDelete(syncedOld);
    }

    // Delete dead ops older than 7 days (use createdAt as proxy)
    const deadOps = await db.syncOutbox
      .where("[status+createdAt]")
      .between(["dead", Dexie.minKey], ["dead", cutoff])
      .primaryKeys();
    if (deadOps.length > 0) {
      await db.syncOutbox.bulkDelete(deadOps);
    }
  }

  /** Initial bootstrap: push all existing local data if not done yet. */
  async initialBootstrap(): Promise<void> {
    const flag = await db.syncMeta.get("initialPushCompleted");
    if (flag?.value === true) return;

    const accountId = await resolveAccountId();

    // Gather all active entities
    const workspaces = await activeWorkspaces(accountId).toArray();
    const allCollections: TabCollection[] = [];
    const allTabs: CollectionTab[] = [];

    for (const ws of workspaces) {
      if (ws.id == null) continue;
      const cols = await activeCollections(ws.id).toArray();
      allCollections.push(...cols);
      for (const col of cols) {
        if (col.id == null) continue;
        const tabs = await activeTabs(col.id).toArray();
        allTabs.push(...tabs);
      }
    }

    // Generate create ops in parent-first order
    const now = Date.now();
    const ops: Omit<
      SyncOp,
      "id" | "status" | "attemptCount" | "lastError" | "nextRetryAt" | "syncedAt"
    >[] = [];

    for (const ws of workspaces) {
      ops.push({
        opId: crypto.randomUUID(),
        entityType: "workspace",
        entitySyncId: ws.syncId,
        action: "create",
        payload: {
          syncId: ws.syncId,
          name: ws.name,
          icon: ws.icon,
          order: ws.order,
          viewMode: ws.viewMode ?? null,
        },
        createdAt: now,
      });
    }

    for (const col of allCollections) {
      const ws = workspaces.find((w) => w.id === col.workspaceId);
      ops.push({
        opId: crypto.randomUUID(),
        entityType: "collection",
        entitySyncId: col.syncId,
        action: "create",
        payload: {
          syncId: col.syncId,
          name: col.name,
          order: col.order,
          parentSyncId: col.workspaceSyncId || ws?.syncId || "",
        },
        createdAt: now,
      });
    }

    for (const tab of allTabs) {
      const col = allCollections.find((c) => c.id === tab.collectionId);
      ops.push({
        opId: crypto.randomUUID(),
        entityType: "tab",
        entitySyncId: tab.syncId,
        action: "create",
        payload: {
          syncId: tab.syncId,
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl ?? null,
          order: tab.order,
          parentSyncId: tab.collectionSyncId || col?.syncId || "",
        },
        createdAt: now,
      });
    }

    // Insert into outbox
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

    await db.syncMeta.put({ key: "initialPushCompleted", value: true });

    // Trigger sync immediately
    await this.sync();
  }

  // ---- private ----------------------------------------------------------

  private async getTRPC() {
    return getExtensionTRPCClient();
  }

  private broadcastSyncApplied() {
    chrome.runtime.sendMessage({ type: MSG.SYNC_APPLIED }).catch(() => {});
  }

  // ---- push -------------------------------------------------------------

  private async push(): Promise<void> {
    const startTime = Date.now();

    for (let batch = 0; batch < PUSH_LOOP_BATCH_LIMIT; batch++) {
      if (Date.now() - startTime > PUSH_LOOP_TIME_LIMIT) break;

      const pendingOps = await db.syncOutbox
        .where("[status+createdAt]")
        .between(["pending", Dexie.minKey], ["pending", Dexie.maxKey])
        .limit(100)
        .toArray();

      if (pendingOps.length === 0) break;

      try {
        const trpc = await this.getTRPC();
        const result = await trpc.sync.push.mutate({
          ops: pendingOps.map((op) => ({
            opId: op.opId,
            entityType: op.entityType,
            entitySyncId: op.entitySyncId,
            action: op.action,
            payload: op.payload as never,
            timestamp: op.createdAt,
          })),
        });

        // Mark accepted + duplicates as synced
        const syncedOpIds = new Set([...result.applied, ...result.duplicates]);
        const now = Date.now();
        for (const op of pendingOps) {
          if (syncedOpIds.has(op.opId)) {
            await db.syncOutbox.update(op.id!, { status: "synced", syncedAt: now });
          }
        }

        // Handle partial failure
        if (result.error) {
          // Mark remaining non-synced ops as failed
          for (const op of pendingOps) {
            if (!syncedOpIds.has(op.opId)) {
              await db.syncOutbox.update(op.id!, {
                status: "failed",
                attemptCount: op.attemptCount + 1,
                lastError: result.error,
                nextRetryAt: Date.now() + backoffMs(op.attemptCount + 1),
              });
            }
          }
          break;
        }
      } catch (err) {
        if (isUnauthorizedError(err)) {
          // Re-authenticate and continue
          try {
            const settings = await getSettings();
            await clearAuthState();
            await initializeAuth(settings.server_url);
            continue;
          } catch (authErr) {
            console.error("[sync] re-auth failed:", authErr);
            break;
          }
        }

        // Network / other error: mark all as failed with backoff
        for (const op of pendingOps) {
          const newAttempt = op.attemptCount + 1;
          await db.syncOutbox.update(op.id!, {
            status: newAttempt >= MAX_ATTEMPT_COUNT ? "dead" : "failed",
            attemptCount: newAttempt,
            lastError: String(err),
            nextRetryAt: Date.now() + backoffMs(newAttempt),
          });
        }
        break;
      }
    }
  }

  // ---- pull -------------------------------------------------------------

  private async pull(): Promise<number> {
    let totalApplied = 0;
    let cursor = await this.getCursor();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const trpc = await this.getTRPC();
      let result: Awaited<ReturnType<typeof trpc.sync.pull.query>>;
      try {
        result = await trpc.sync.pull.query({ cursor, limit: 100 });
      } catch (err) {
        if (isUnauthorizedError(err)) {
          try {
            const settings = await getSettings();
            await clearAuthState();
            await initializeAuth(settings.server_url);
            continue;
          } catch {
            break;
          }
        }
        console.error("[sync] pull error:", err);
        break;
      }

      if (result.resetRequired) {
        await this.fullReset();
        return 1; // Signal that data changed
      }

      if (result.changes.length === 0) break;

      // Two-pass deferred handling
      const deferred: ChangeEntry[] = [];
      let batchMaxSeq = cursor;

      for (const change of result.changes) {
        if (change.seq > batchMaxSeq) batchMaxSeq = change.seq;
        const applied = await this.applyRemoteChange(change);
        if (!applied) {
          deferred.push(change);
        } else {
          totalApplied++;
        }
      }

      // Second pass for deferred
      if (deferred.length > 0) {
        let firstUnresolvedSeq: number | null = null;
        for (const change of deferred) {
          const applied = await this.applyRemoteChange(change);
          if (applied) {
            totalApplied++;
          } else if (firstUnresolvedSeq === null) {
            firstUnresolvedSeq = change.seq;
          }
        }

        // Cursor advancement: min(firstUnresolvedSeq-1, batchMaxSeq)
        if (firstUnresolvedSeq !== null) {
          cursor = Math.min(firstUnresolvedSeq - 1, batchMaxSeq);
        } else {
          cursor = batchMaxSeq;
        }
      } else {
        cursor = batchMaxSeq;
      }

      await this.setCursor(cursor);

      if (!result.hasMore) break;
    }

    return totalApplied;
  }

  // ---- apply remote change ----------------------------------------------

  /**
   * Returns true if applied, false if deferred (e.g. parent not found yet).
   */
  private async applyRemoteChange(change: ChangeEntry): Promise<boolean> {
    // Self-echo skip: check if this opId exists in our outbox
    const existing = await db.syncOutbox.where("opId").equals(change.opId).first();
    if (existing) return true; // Already handled locally

    if (change.action === "delete") {
      return this.applyDelete(change);
    }
    return this.applyCreateOrUpdate(change);
  }

  private async applyCreateOrUpdate(change: ChangeEntry): Promise<boolean> {
    const payload = change.payload;
    const syncId = String(payload.syncId ?? change.entitySyncId);

    switch (change.entityType) {
      case "workspace": {
        const existing = await db.workspaces.where("syncId").equals(syncId).first();

        if (existing) {
          // LWW check
          if (existing.updatedAt > change.createdAt) return true;
          // Update with explicit field-picking
          await db.workspaces.update(existing.id!, {
            ...(payload.name != null && { name: String(payload.name) }),
            ...(payload.icon != null && { icon: String(payload.icon) }),
            ...(payload.order != null && { order: String(payload.order) }),
            ...("viewMode" in payload && {
              viewMode: (payload.viewMode as ViewMode | undefined) ?? undefined,
            }),
            lastOpId: change.opId,
            updatedAt: change.createdAt,
          });
        } else {
          // Create
          const accountId = await resolveAccountId();
          await db.workspaces.add({
            accountId,
            syncId,
            name: String(payload.name ?? "Untitled"),
            icon: String(payload.icon ?? "folder"),
            order: String(payload.order ?? generateKeyBetween(null, null)),
            viewMode: (payload.viewMode as ViewMode | undefined) ?? undefined,
            deletedAt: null,
            lastOpId: change.opId,
            createdAt: change.createdAt,
            updatedAt: change.createdAt,
          });
        }
        return true;
      }

      case "collection": {
        const existing = await db.tabCollections.where("syncId").equals(syncId).first();
        const parentSyncId = String(payload.parentSyncId ?? "");

        // Resolve parent workspace by syncId
        const parentWs = parentSyncId
          ? await db.workspaces.where("syncId").equals(parentSyncId).first()
          : null;

        if (!parentWs && change.action === "create" && !existing) {
          return false; // Defer: parent not found yet
        }

        if (existing) {
          if (existing.updatedAt > change.createdAt) return true;
          await db.tabCollections.update(existing.id!, {
            ...(payload.name != null && { name: String(payload.name) }),
            ...(payload.order != null && { order: String(payload.order) }),
            ...(parentWs && { workspaceId: parentWs.id!, workspaceSyncId: parentSyncId }),
            lastOpId: change.opId,
            updatedAt: change.createdAt,
          });
        } else {
          if (!parentWs) return false;
          await db.tabCollections.add({
            workspaceId: parentWs.id!,
            workspaceSyncId: parentSyncId,
            syncId,
            name: String(payload.name ?? "Untitled"),
            order: String(payload.order ?? generateKeyBetween(null, null)),
            deletedAt: null,
            lastOpId: change.opId,
            createdAt: change.createdAt,
            updatedAt: change.createdAt,
          });
        }
        return true;
      }

      case "tab": {
        const existing = await db.collectionTabs.where("syncId").equals(syncId).first();
        const parentSyncId = String(payload.parentSyncId ?? "");

        // Resolve parent collection by syncId
        const parentCol = parentSyncId
          ? await db.tabCollections.where("syncId").equals(parentSyncId).first()
          : null;

        if (!parentCol && change.action === "create" && !existing) {
          return false; // Defer: parent not found yet
        }

        if (existing) {
          if (existing.updatedAt > change.createdAt) return true;
          await db.collectionTabs.update(existing.id!, {
            ...(payload.url != null && { url: String(payload.url) }),
            ...(payload.title != null && { title: String(payload.title) }),
            ...("favIconUrl" in payload && {
              favIconUrl: payload.favIconUrl != null ? String(payload.favIconUrl) : undefined,
            }),
            ...(payload.order != null && { order: String(payload.order) }),
            ...(parentCol && { collectionId: parentCol.id!, collectionSyncId: parentSyncId }),
            lastOpId: change.opId,
            updatedAt: change.createdAt,
          });
        } else {
          if (!parentCol) return false;
          await db.collectionTabs.add({
            collectionId: parentCol.id!,
            collectionSyncId: parentSyncId,
            syncId,
            url: String(payload.url ?? ""),
            title: String(payload.title ?? "Untitled"),
            favIconUrl: payload.favIconUrl != null ? String(payload.favIconUrl) : undefined,
            order: String(payload.order ?? generateKeyBetween(null, null)),
            deletedAt: null,
            lastOpId: change.opId,
            createdAt: change.createdAt,
            updatedAt: change.createdAt,
          });
        }
        return true;
      }

      default:
        console.warn("[sync] unknown entity type:", change.entityType);
        return true;
    }
  }

  private async applyDelete(change: ChangeEntry): Promise<boolean> {
    const syncId = String(change.payload.syncId ?? change.entitySyncId);
    const deletedAt =
      typeof change.payload.deletedAt === "number" ? change.payload.deletedAt : Date.now();

    switch (change.entityType) {
      case "workspace": {
        const existing = await db.workspaces.where("syncId").equals(syncId).first();
        if (!existing) return true;
        if (existing.updatedAt > change.createdAt) return true;

        await db.workspaces.update(existing.id!, {
          deletedAt,
          lastOpId: change.opId,
          updatedAt: change.createdAt,
        });

        // Check if zero active workspaces remain; auto-create default
        const accountId = await resolveAccountId();
        const remaining = await activeWorkspaces(accountId).count();
        if (remaining === 0) {
          await db.workspaces.add({
            accountId,
            syncId: crypto.randomUUID(),
            name: "Default",
            icon: "folder",
            order: generateKeyBetween(null, null),
            deletedAt: null,
            lastOpId: "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        return true;
      }

      case "collection": {
        const existing = await db.tabCollections.where("syncId").equals(syncId).first();
        if (!existing) return true;
        if (existing.updatedAt > change.createdAt) return true;

        await db.tabCollections.update(existing.id!, {
          deletedAt,
          lastOpId: change.opId,
          updatedAt: change.createdAt,
        });
        return true;
      }

      case "tab": {
        const existing = await db.collectionTabs.where("syncId").equals(syncId).first();
        if (!existing) return true;
        if (existing.updatedAt > change.createdAt) return true;

        await db.collectionTabs.update(existing.id!, {
          deletedAt,
          lastOpId: change.opId,
          updatedAt: change.createdAt,
        });
        return true;
      }

      default:
        return true;
    }
  }

  // ---- full reset -------------------------------------------------------

  private async fullReset(): Promise<void> {
    // TTL lease lock
    const lockMeta = await db.syncMeta.get("fullResetLock");
    const now = Date.now();
    if (
      lockMeta &&
      typeof lockMeta.value === "number" &&
      now - lockMeta.value < FULL_RESET_TTL_MS
    ) {
      console.warn("[sync] fullReset already in progress, skipping");
      return;
    }
    await db.syncMeta.put({ key: "fullResetLock", value: now });

    try {
      const trpc = await this.getTRPC();
      const snapshot = await trpc.sync.snapshot.query();
      const accountId = await resolveAccountId();

      await db.transaction(
        "rw",
        [db.workspaces, db.tabCollections, db.collectionTabs, db.syncMeta],
        async () => {
          // Clear existing data (NOT touching syncOutbox)
          await db.workspaces.clear();
          await db.tabCollections.clear();
          await db.collectionTabs.clear();

          // Write workspaces
          const wsSyncIdToLocalId = new Map<string, number>();
          for (const ws of snapshot.workspaces) {
            const id = await db.workspaces.add({
              accountId,
              syncId: String(ws.syncId),
              name: String(ws.name ?? "Untitled"),
              icon: String(ws.icon ?? "folder"),
              order: String(ws.order ?? generateKeyBetween(null, null)),
              viewMode: (ws.viewMode as ViewMode | undefined) ?? undefined,
              deletedAt: null,
              lastOpId: "",
              createdAt: typeof ws.createdAt === "number" ? ws.createdAt : Date.now(),
              updatedAt: typeof ws.updatedAt === "number" ? ws.updatedAt : Date.now(),
            });
            wsSyncIdToLocalId.set(String(ws.syncId), id!);
          }

          // Write collections
          const colSyncIdToLocalId = new Map<string, number>();
          for (const col of snapshot.collections) {
            const parentSyncId = String(col.parentSyncId ?? col.workspaceSyncId ?? "");
            const workspaceId = wsSyncIdToLocalId.get(parentSyncId) ?? 0;
            const id = await db.tabCollections.add({
              workspaceId,
              workspaceSyncId: parentSyncId,
              syncId: String(col.syncId),
              name: String(col.name ?? "Untitled"),
              order: String(col.order ?? generateKeyBetween(null, null)),
              deletedAt: null,
              lastOpId: "",
              createdAt: typeof col.createdAt === "number" ? col.createdAt : Date.now(),
              updatedAt: typeof col.updatedAt === "number" ? col.updatedAt : Date.now(),
            });
            colSyncIdToLocalId.set(String(col.syncId), id!);
          }

          // Write tabs
          for (const tab of snapshot.tabs) {
            const parentSyncId = String(tab.parentSyncId ?? tab.collectionSyncId ?? "");
            const collectionId = colSyncIdToLocalId.get(parentSyncId) ?? 0;
            await db.collectionTabs.add({
              collectionId,
              collectionSyncId: parentSyncId,
              syncId: String(tab.syncId),
              url: String(tab.url ?? ""),
              title: String(tab.title ?? "Untitled"),
              favIconUrl: tab.favIconUrl != null ? String(tab.favIconUrl) : undefined,
              order: String(tab.order ?? generateKeyBetween(null, null)),
              deletedAt: null,
              lastOpId: "",
              createdAt: typeof tab.createdAt === "number" ? tab.createdAt : Date.now(),
              updatedAt: typeof tab.updatedAt === "number" ? tab.updatedAt : Date.now(),
            });
          }

          // Update cursor
          await db.syncMeta.put({ key: "pullCursor", value: snapshot.cursor });
        },
      );

      // If zero workspaces after snapshot, auto-create default
      const wsCount = await activeWorkspaces(accountId).count();
      if (wsCount === 0) {
        await db.workspaces.add({
          accountId,
          syncId: crypto.randomUUID(),
          name: "Default",
          icon: "folder",
          order: generateKeyBetween(null, null),
          deletedAt: null,
          lastOpId: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      // Push remaining outbox ops
      await this.push();

      this.broadcastSyncApplied();
    } finally {
      await db.syncMeta.delete("fullResetLock");
    }
  }

  // ---- cursor helpers ---------------------------------------------------

  private async getCursor(): Promise<number> {
    const meta = await db.syncMeta.get("pullCursor");
    return typeof meta?.value === "number" ? meta.value : 0;
  }

  private async setCursor(cursor: number): Promise<void> {
    await db.syncMeta.put({ key: "pullCursor", value: cursor });
  }
}
