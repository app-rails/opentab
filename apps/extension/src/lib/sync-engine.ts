import { type PushOp, SyncErrorCode } from "@opentab/protocol";
import Dexie from "dexie";
import { generateKeyBetween } from "fractional-indexing";
import { v7 as uuidv7 } from "uuid";
import { MSG } from "./constants";
import type { CollectionTab, SyncOp, TabCollection } from "./db";
import { db } from "./db";
import { activeCollections, activeTabs, activeWorkspaces } from "./db-queries";
import { newPendingOp, type SyncOpInput } from "./mutate-with-outbox";
import { resolveAccountId } from "./resolve-account-id";
import { getSettings } from "./settings";
import { createSyncClientFromState, type SyncClient, SyncClientError } from "./sync-client";
import { type SyncSettings, setSyncSettings } from "./sync-settings";
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

const PUSH_DEBOUNCE_MS = 500;
const PUSH_LOOP_TIME_LIMIT = 30_000;
const PUSH_LOOP_BATCH_LIMIT = 10;
const CLEANUP_RETENTION_DAYS = 7;
const CLEANUP_RETENTION_MS = CLEANUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const FULL_RESET_TTL_MS = 60_000;

/**
 * Error codes that indicate the SyncClient has already broadcasted a
 * lifecycle message (see sync-client.ts) and the engine should stop the
 * current cycle silently instead of logging/retrying.
 */
const TERMINAL_BROADCAST_CODES: ReadonlySet<string> = new Set([
  SyncErrorCode.UNAUTHORIZED,
  SyncErrorCode.DEVICE_NOT_REGISTERED,
  SyncErrorCode.API_VERSION_MISMATCH,
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 300_000);
}

/**
 * The wire URL schema (`httpUrlSchema`) only accepts http/https. chrome://
 * file://, chrome-extension://, etc. round-trip locally but would 400 the
 * entire push batch on the server. We drop them silently from sync rather
 * than blow up the batch — they'd be meaningless on a different device
 * anyway (different chrome internals, different file paths).
 */
function isSyncableUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

// ---------------------------------------------------------------------------
// 429 cooldown — keyed in syncMeta so it survives MV3 worker restarts and is
// shared between sync() and any future entry point.
// ---------------------------------------------------------------------------

const SYNC_COOLDOWN_KEY = "syncCooldownUntil";
const DEFAULT_COOLDOWN_SEC = 60;

async function isInCooldown(): Promise<boolean> {
  const meta = await db.syncMeta.get(SYNC_COOLDOWN_KEY);
  return typeof meta?.value === "number" && meta.value > Date.now();
}

async function applyCooldown(retryAfterSec: number | undefined): Promise<void> {
  // Server's Retry-After is the source of truth; we fall back to a 60s
  // floor if the response didn't carry one (older server / proxy stripped
  // the header).
  const seconds =
    Number.isFinite(retryAfterSec) && retryAfterSec! > 0 ? retryAfterSec! : DEFAULT_COOLDOWN_SEC;
  await db.syncMeta.put({ key: SYNC_COOLDOWN_KEY, value: Date.now() + seconds * 1000 });
}

/**
 * Categorise an error for the outbox `lastError` field. Distinguishing
 * server-side (5xx) from client-side (4xx ≠ 429) from transport (no
 * SyncClientError = network / fetch failure) makes the failed-count UI
 * actionable: a wall of "server error 503" tells a different story from
 * "client error 400 INVALID_PAYLOAD".
 */
function describeFailure(err: unknown): string {
  if (err instanceof SyncClientError) {
    if (err.status >= 500) return `server error ${err.status}: ${err.message}`;
    if (err.status >= 400) return `client error ${err.status} ${err.code}: ${err.message}`;
    return `${err.status} ${err.code}: ${err.message}`;
  }
  return `network error: ${String(err)}`;
}

/** LWW: existing wins if newer timestamp, or same timestamp with higher opId */
function existingWinsLWW(
  existing: { updatedAt: number; lastOpId?: string },
  change: { createdAt: number; opId: string },
): boolean {
  if (existing.updatedAt > change.createdAt) return true;
  if (existing.updatedAt === change.createdAt) {
    return (existing.lastOpId ?? "") >= change.opId;
  }
  return false;
}

/**
 * Convert a local outbox row into the wire-format `PushOp`. Payload fields are
 * forwarded untouched — server-side zod will reject malformed payloads with
 * INVALID_PAYLOAD and the engine will mark only the offending op as failed.
 *
 * NB: the wire schema uses a single dotted `kind` (e.g. `workspace.create`)
 * whereas the local SyncOp row splits that across `entityType` + `action`.
 */
function toWireOp(op: SyncOp): PushOp {
  const kind = `${op.entityType}.${op.action}` as PushOp["kind"];
  return {
    kind,
    opId: op.opId,
    entitySyncId: op.entitySyncId,
    payload: op.payload,
  } as PushOp;
}

// ---------------------------------------------------------------------------
// SyncEngine
// ---------------------------------------------------------------------------

export class SyncEngine {
  private isSyncing = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Pause flag toggled by background.ts when SyncSettings.enabled flips. Keeps
  // the engine instance alive (outbox writes still queue via mutateWithOutbox)
  // while suppressing the network round-trip — flipping enabled back on then
  // resumes without re-running ensureSyncEngine().
  private paused = false;

  constructor(private readonly client: SyncClient) {}

  // ---- public API -------------------------------------------------------

  /** True while pause() has been called and resume() hasn't yet. */
  get isPaused(): boolean {
    return this.paused;
  }

  /** Suppress further sync() / syncIfNeeded() calls until resume(). */
  pause(): void {
    this.paused = true;
  }

  /** Re-enable sync() / syncIfNeeded() after a previous pause(). */
  resume(): void {
    this.paused = false;
  }

  /** Check if a sync is needed based on polling interval, then sync. */
  async syncIfNeeded(): Promise<void> {
    if (this.paused) return;
    const settings = await getSettings();
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
    if (this.paused) return;
    if (this.isSyncing) return;
    // Server rate-limits per-user; every entry point (storage-listener,
    // alarm, manual Sync now button, debounced mutate notify) routes
    // through this method, so a single cooldown floor prevents them from
    // collectively re-tripping the same limit.
    if (await isInCooldown()) return;
    this.isSyncing = true;
    try {
      await this.push();
      const pullCount = await this.pull();

      await db.syncMeta.put({ key: "lastSyncAt", value: Date.now() });

      // SYNC_PROGRESS fires every cycle so status displays (lastSync,
      // pending count) tick down in real time as the bg drains the outbox.
      // SYNC_APPLIED is reserved for "remote data arrived" — it triggers
      // workspace re-fetch in the dashboard, which is wasteful when no
      // pull happened.
      this.broadcastSyncProgress();
      if (pullCount > 0) {
        this.broadcastSyncApplied();
      }
    } catch (err) {
      if (isTerminalBroadcastError(err)) {
        // sync-client already broadcasted SYNC_AUTH_REQUIRED /
        // SYNC_PROTOCOL_MISMATCH and cleared auth; stop gracefully so the
        // next cycle waits for the user to re-authenticate.
        return;
      }
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
      .limit(100)
      .toArray();

    if (failedOps.length === 0) return;

    // Same data-loss-aversion stance as push(): never auto-promote to dead
    // based on attempt count. A persistent failure is a UX problem the user
    // needs to see (the server panel's sync log surfaces failed ops via the
    // "仅重试中" filter in server-sync-log.tsx), not a silent discard. Retry
    // every failed op forever with capped backoff.
    try {
      const result = await this.client.push(failedOps.map(toWireOp));

      // Mark synced: applied ∪ duplicates ∪ lwwSkipped are all terminal.
      const syncedOpIds = new Set([...result.applied, ...result.duplicates, ...result.lwwSkipped]);
      const idsToSync = failedOps.filter((op) => syncedOpIds.has(op.opId)).map((op) => op.id!);
      if (idsToSync.length > 0) {
        await db.syncOutbox
          .where("id")
          .anyOf(idsToSync)
          .modify({ status: "synced", syncedAt: now });
      }
    } catch (err) {
      if (isTerminalBroadcastError(err)) return;
      if (err instanceof SyncClientError && err.status === 429) {
        await applyCooldown(err.retryAfterSec);
        return;
      }
      for (const op of failedOps) {
        const newAttempt = op.attemptCount + 1;
        await db.syncOutbox.update(op.id!, {
          status: "failed",
          attemptCount: newAttempt,
          lastError: describeFailure(err),
          nextRetryAt: now + backoffMs(newAttempt),
        });
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

  /**
   * Initial bootstrap: enqueue create ops for every local entity, then sync.
   *
   * Idempotent by default via the `initialPushCompleted` marker so a future
   * poll-driven caller can't accidentally redo the bulk push. The wizard's
   * `Upload local data` button MUST pass `{ force: true }` because the
   * marker is sticky in IndexedDB across sessions — a previous wizard run
   * that ran the actor but had its trailing sync silently dropped (e.g. the
   * old server_enabled gate, since removed) leaves the marker set, and the
   * next user-driven Upload would no-op without ever hitting the network.
   */
  async initialBootstrap(opts: { force?: boolean } = {}): Promise<void> {
    if (!opts.force) {
      const flag = await db.syncMeta.get("initialPushCompleted");
      if (flag?.value === true) return;
    }

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
    const ops: SyncOpInput[] = [];
    // Count what we drop so the UI can surface "X items not synced
    // (chrome:// / file:// / orphan)" — silent skips were a debugging
    // black hole when the user wondered where their tabs went.
    let skippedCount = 0;

    for (const ws of workspaces) {
      ops.push({
        opId: uuidv7(),
        entityType: "workspace",
        entitySyncId: ws.syncId,
        action: "create",
        payload: {
          syncId: ws.syncId,
          name: ws.name,
          icon: ws.icon,
          order: ws.order,
          viewMode: ws.viewMode ?? null,
          updatedAt: ws.updatedAt,
          deletedAt: null,
        },
        createdAt: now,
      });
    }

    for (const col of allCollections) {
      const ws = workspaces.find((w) => w.id === col.workspaceId);
      const parentSyncId = col.workspaceSyncId || ws?.syncId;
      if (!parentSyncId) {
        console.warn("[sync] skipping collection with no parent workspace:", col.syncId);
        skippedCount++;
        continue;
      }
      ops.push({
        opId: uuidv7(),
        entityType: "collection",
        entitySyncId: col.syncId,
        action: "create",
        payload: {
          syncId: col.syncId,
          name: col.name,
          order: col.order,
          parentSyncId,
          updatedAt: col.updatedAt,
          deletedAt: null,
        },
        createdAt: now,
      });
    }

    for (const tab of allTabs) {
      const col = allCollections.find((c) => c.id === tab.collectionId);
      const parentSyncId = tab.collectionSyncId || col?.syncId;
      // The wire schema (`tabCreatePayloadSchema` in @opentab/protocol) requires
      // a uuid v7 parentSyncId and an http(s) url, and treats favIconUrl/title
      // as `optional()` — meaning omit-or-undefined, NOT null. Send anything
      // that violates these and the server's zod parse rejects the entire
      // 100-op batch with 400 INVALID_PAYLOAD, taking every other op in the
      // batch down with it. So: skip orphans, skip non-http(s) URLs, and
      // build the payload without explicit-null sentinels.
      if (!parentSyncId) {
        console.warn("[sync] skipping tab with no parent collection:", tab.syncId);
        skippedCount++;
        continue;
      }
      if (!isSyncableUrl(tab.url)) {
        console.warn("[sync] skipping tab with non-http(s) URL:", tab.url);
        skippedCount++;
        continue;
      }
      ops.push({
        opId: uuidv7(),
        entityType: "tab",
        entitySyncId: tab.syncId,
        action: "create",
        payload: {
          syncId: tab.syncId,
          url: tab.url,
          ...(tab.title != null && tab.title !== "" && { title: tab.title }),
          ...(tab.favIconUrl != null && { favIconUrl: tab.favIconUrl }),
          order: tab.order,
          parentSyncId,
          updatedAt: tab.updatedAt,
          deletedAt: null,
        },
        createdAt: now,
      });
    }

    // Insert into outbox
    if (ops.length > 0) {
      await db.syncOutbox.bulkAdd(ops.map(newPendingOp));
    }

    await db.syncMeta.put({ key: "initialPushCompleted", value: true });
    await db.syncMeta.put({ key: "lastBootstrapSkipped", value: skippedCount });

    // Trigger sync immediately
    await this.sync();
  }

  // ---- private ----------------------------------------------------------

  private broadcastSyncApplied() {
    chrome.runtime.sendMessage({ type: MSG.SYNC_APPLIED }).catch(() => {});
  }

  private broadcastSyncProgress() {
    chrome.runtime.sendMessage({ type: MSG.SYNC_PROGRESS }).catch(() => {});
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
        const result = await this.client.push(pendingOps.map(toWireOp));

        // Mark applied ∪ duplicates ∪ lwwSkipped as synced. All three buckets
        // are terminal: `applied` is server-applied, `duplicates` means the
        // server already has this opId recorded, and `lwwSkipped` means the
        // server saw a newer version and will not apply — retrying any of
        // these would be wasted work.
        const syncedOpIds = new Set([
          ...result.applied,
          ...result.duplicates,
          ...result.lwwSkipped,
        ]);
        const now = Date.now();

        const idsToSync = pendingOps.filter((op) => syncedOpIds.has(op.opId)).map((op) => op.id!);
        if (idsToSync.length > 0) {
          await db.syncOutbox
            .where("id")
            .anyOf(idsToSync)
            .modify({ status: "synced", syncedAt: now });
        }

        // Handle partial failure: exactly one op (at `error.opId`) is marked
        // failed for retry; the server short-circuits the batch so any ops
        // after the failing one remain in `pending` for the next cycle. We
        // deliberately never escalate to "dead" — that's the data-loss path
        // (cleanupOutbox bulkDeletes dead rows after 7 days, which means a
        // local change that never reached the server is silently discarded).
        // Stuck ops are a UX problem worth surfacing, not a data-integrity
        // outcome to bury.
        if (result.error) {
          const failingOp = pendingOps.find((op) => op.opId === result.error!.opId);
          if (failingOp) {
            const newAttempt = failingOp.attemptCount + 1;
            await db.syncOutbox.update(failingOp.id!, {
              status: "failed" as const,
              attemptCount: newAttempt,
              lastError: `${result.error.code}: ${result.error.message}`,
              nextRetryAt: Date.now() + backoffMs(newAttempt),
            });
          }
          break;
        }
      } catch (err) {
        // Auth expiry: 401 (sync-client already cleared auth + broadcasted) or
        // 403 (FORBIDDEN — server rejected an otherwise-valid token, e.g.
        // revoked device). Re-clear auth as defense-in-depth so the reauth
        // banner surfaces via server-page's `enabled && !auth && savedConfig`
        // shape. Idempotent on the 401 path since sync-client already did it.
        if (isAuthExpiredError(err)) {
          await setSyncSettings({ auth: null });
        }
        if (isTerminalBroadcastError(err)) {
          // sync-client already broadcasted; don't increment attempt counts.
          break;
        }

        // 429: record server-suggested cooldown; ops stay pending for the
        // next sync (no failure marking — they're valid, we just need to
        // wait).
        if (err instanceof SyncClientError && err.status === 429) {
          await applyCooldown(err.retryAfterSec);
          break;
        }

        // Any other HTTP error (4xx ≠ 429, 5xx) or network error: mark the
        // batch failed with backoff. Same data-loss-aversion note as above:
        // never auto-escalate to dead. 5xx is by definition a server problem
        // and the op is fine; 4xx might be a server contract drift the user
        // can recover from once we (or they) fix it. Either way, dropping
        // the op silently is wrong.
        const now = Date.now();
        const failedIds = pendingOps.map((op) => op.id!);
        const newAttempt = pendingOps[0].attemptCount + 1;
        const backoff = backoffMs(newAttempt);
        await db.syncOutbox
          .where("id")
          .anyOf(failedIds)
          .modify({
            status: "failed" as const,
            attemptCount: newAttempt,
            lastError: describeFailure(err),
            nextRetryAt: now + backoff,
          });
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
      let result: Awaited<ReturnType<SyncClient["pull"]>>;
      try {
        result = await this.client.pull(cursor, 100);
      } catch (err) {
        // Same defense-in-depth auth-clearing as push() above; covers 403
        // FORBIDDEN and re-runs the 401 clear idempotently.
        if (isAuthExpiredError(err)) {
          await setSyncSettings({ auth: null });
        }
        if (isTerminalBroadcastError(err)) break;
        if (err instanceof SyncClientError && err.status === 429) {
          await applyCooldown(err.retryAfterSec);
          break;
        }
        console.error("[sync] pull error:", err);
        break;
      }

      if (result.resetRequired) {
        await this.fullReset();
        return 1; // Signal that data changed
      }

      if (result.changes.length === 0) break;

      // Pre-fetch opIds for self-echo check
      const batchOpIds = result.changes.map((c) => c.opId);
      const localOps = await db.syncOutbox.where("opId").anyOf(batchOpIds).toArray();
      const localOpIdSet = new Set(localOps.map((o) => o.opId));

      // Two-pass deferred handling
      const deferred: ChangeEntry[] = [];
      let batchMaxSeq = cursor;

      for (const change of result.changes) {
        if (change.seq > batchMaxSeq) batchMaxSeq = change.seq;
        const applied = await this.applyRemoteChange(change, localOpIdSet);
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
          const applied = await this.applyRemoteChange(change, localOpIdSet);
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
  private async applyRemoteChange(
    change: ChangeEntry,
    localOpIdSet: Set<string>,
  ): Promise<boolean> {
    // Self-echo skip: check if this opId exists in our outbox
    if (localOpIdSet.has(change.opId)) return true; // Already handled locally

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
          if (existingWinsLWW(existing, change)) return true;
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
          if (existingWinsLWW(existing, change)) return true;
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
          if (existingWinsLWW(existing, change)) return true;
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
      typeof change.payload.deletedAt === "number" ? change.payload.deletedAt : change.createdAt;

    switch (change.entityType) {
      case "workspace": {
        const existing = await db.workspaces.where("syncId").equals(syncId).first();
        if (!existing) return true;
        if (existingWinsLWW(existing, change)) return true;

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
            syncId: uuidv7(),
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
        if (existingWinsLWW(existing, change)) return true;

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
        if (existingWinsLWW(existing, change)) return true;

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
      const snapshot = await this.client.snapshot();
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
              deletedAt: typeof ws.deletedAt === "number" ? ws.deletedAt : null,
              lastOpId: "",
              createdAt: typeof ws.createdAt === "number" ? ws.createdAt : Date.now(),
              updatedAt: typeof ws.updatedAt === "number" ? ws.updatedAt : Date.now(),
            });
            wsSyncIdToLocalId.set(String(ws.syncId), id!);
          }

          // Write collections
          const colSyncIdToLocalId = new Map<string, number>();
          for (const col of snapshot.collections) {
            const parentSyncId = String(col.parentSyncId ?? "");
            const workspaceId = wsSyncIdToLocalId.get(parentSyncId);
            if (workspaceId == null) {
              console.warn(
                "[sync] fullReset: skipping collection with unknown parent:",
                parentSyncId,
              );
              continue;
            }
            const id = await db.tabCollections.add({
              workspaceId,
              workspaceSyncId: parentSyncId,
              syncId: String(col.syncId),
              name: String(col.name ?? "Untitled"),
              order: String(col.order ?? generateKeyBetween(null, null)),
              deletedAt: typeof col.deletedAt === "number" ? col.deletedAt : null,
              lastOpId: "",
              createdAt: typeof col.createdAt === "number" ? col.createdAt : Date.now(),
              updatedAt: typeof col.updatedAt === "number" ? col.updatedAt : Date.now(),
            });
            colSyncIdToLocalId.set(String(col.syncId), id!);
          }

          // Write tabs
          for (const tab of snapshot.tabs) {
            const parentSyncId = String(tab.parentSyncId ?? "");
            const collectionId = colSyncIdToLocalId.get(parentSyncId);
            if (collectionId == null) {
              console.warn("[sync] fullReset: skipping tab with unknown parent:", parentSyncId);
              continue;
            }
            await db.collectionTabs.add({
              collectionId,
              collectionSyncId: parentSyncId,
              syncId: String(tab.syncId),
              url: String(tab.url ?? ""),
              title: String(tab.title ?? "Untitled"),
              favIconUrl: tab.favIconUrl != null ? String(tab.favIconUrl) : undefined,
              order: String(tab.order ?? generateKeyBetween(null, null)),
              deletedAt: typeof tab.deletedAt === "number" ? tab.deletedAt : null,
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
          syncId: uuidv7(),
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

/**
 * Factory: builds a `SyncEngine` wired to a sync-settings snapshot. Returns
 * `null` when sync is toggled off or auth/host is missing — callers should
 * treat that as "sync is dormant" and not attempt to operate on the engine.
 */
export function createSyncEngine(settings: SyncSettings): SyncEngine | null {
  const client = createSyncClientFromState(settings);
  if (client === null) return null;
  return new SyncEngine(client);
}

/**
 * Identify errors thrown by `SyncClient` that indicate the client already
 * broadcasted a lifecycle message (SYNC_AUTH_REQUIRED / SYNC_PROTOCOL_MISMATCH)
 * and cleared any ephemeral state. Callers should stop the current cycle
 * silently — retrying would only hit the same 401/426 again.
 */
function isTerminalBroadcastError(err: unknown): boolean {
  return err instanceof SyncClientError && TERMINAL_BROADCAST_CODES.has(err.code);
}

/**
 * 401 UNAUTHORIZED or 403 FORBIDDEN from the sync server — both mean the
 * device's auth is no longer valid (token revoked, account disabled, server
 * policy change, etc.). The engine clears `SyncSettings.auth` so the
 * server-page dispatcher can route the user back into the wizard with a
 * reauth banner explaining why. See spec §1.9 / Task 29.
 */
function isAuthExpiredError(err: unknown): boolean {
  return err instanceof SyncClientError && (err.status === 401 || err.status === 403);
}
