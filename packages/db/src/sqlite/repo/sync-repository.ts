import { and, eq, gt, or, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type {
  ChangeEntry,
  PullResult,
  PushOp,
  PushResult,
  SnapshotResult,
  SyncRepository,
} from "../../core/index.js";
import type { SqliteDb } from "../index.js";
import {
  appliedOps,
  changeLog,
  syncCollectionTabs,
  syncTabCollections,
  syncWorkspaces,
} from "../schema/sync.js";

type Tx = Parameters<Parameters<SqliteDb["transaction"]>[0]>[0];

/** LWW condition: incoming timestamp wins if newer, or same timestamp with greater opId */
function lwwCondition(
  updatedAtCol: AnySQLiteColumn,
  lastOpIdCol: AnySQLiteColumn,
  timestamp: number,
  opId: string,
): SQL | undefined {
  return or(
    gt(sql`${timestamp}`, updatedAtCol),
    and(eq(sql`${timestamp}`, updatedAtCol), gt(sql`${opId}`, sql`coalesce(${lastOpIdCol}, '')`)),
  );
}

export class SqliteSyncRepository implements SyncRepository {
  constructor(private db: SqliteDb) {}

  async pushOps(userId: string, ops: PushOp[]): Promise<PushResult> {
    const applied: string[] = [];
    const duplicates: string[] = [];

    for (const op of ops) {
      try {
        this.db.transaction((tx) => {
          // 1. Insert appliedOps -- unique constraint is the idempotency gate
          tx.insert(appliedOps)
            .values({
              userId,
              opId: op.opId,
              appliedAt: Date.now(),
            })
            .run();

          // 2. Apply the operation
          this.applyOp(tx, userId, op);

          // 3. Insert changeLog entry
          tx.insert(changeLog)
            .values({
              userId,
              entityType: op.entityType,
              entitySyncId: op.entitySyncId,
              action: op.action,
              opId: op.opId,
              payload: JSON.stringify(op.payload),
              createdAt: op.timestamp,
            })
            .run();
        });
        applied.push(op.opId);
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
          duplicates.push(op.opId);
        } else {
          return { applied, duplicates, error: String(e) };
        }
      }
    }

    return { applied, duplicates };
  }

  private applyOp(tx: Tx, userId: string, op: PushOp): void {
    switch (op.entityType) {
      case "workspace":
        this.applyWorkspaceOp(tx, userId, op);
        break;
      case "collection":
        this.applyCollectionOp(tx, userId, op);
        break;
      case "tab":
        this.applyTabOp(tx, userId, op);
        break;
    }
  }

  private applyWorkspaceOp(tx: Tx, userId: string, op: PushOp): void {
    const { entitySyncId, action, payload, timestamp, opId } = op;
    const fields = this.pickWorkspaceFields(payload);
    const lww = lwwCondition(syncWorkspaces.updatedAt, syncWorkspaces.lastOpId, timestamp, opId);

    if (action === "create") {
      tx.insert(syncWorkspaces)
        .values({
          syncId: entitySyncId,
          userId,
          name: (payload.name as string) ?? "",
          icon: (payload.icon as string) ?? "",
          viewMode: (payload.viewMode as string) ?? null,
          order: (payload.order as string) ?? "",
          lastOpId: opId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [syncWorkspaces.userId, syncWorkspaces.syncId],
          set: { ...fields, lastOpId: opId, updatedAt: timestamp },
          setWhere: lww,
        })
        .run();
    } else {
      const setFields: Record<string, unknown> = {
        ...fields,
        lastOpId: opId,
        updatedAt: timestamp,
      };
      if (action === "delete") setFields.deletedAt = timestamp;

      tx.update(syncWorkspaces)
        .set(setFields)
        .where(and(eq(syncWorkspaces.userId, userId), eq(syncWorkspaces.syncId, entitySyncId), lww))
        .run();
    }
  }

  private applyCollectionOp(tx: Tx, userId: string, op: PushOp): void {
    const { entitySyncId, action, payload, timestamp, opId } = op;
    const fields = this.pickCollectionFields(payload);
    const lww = lwwCondition(
      syncTabCollections.updatedAt,
      syncTabCollections.lastOpId,
      timestamp,
      opId,
    );

    if (action === "create") {
      tx.insert(syncTabCollections)
        .values({
          syncId: entitySyncId,
          userId,
          workspaceSyncId: (payload.parentSyncId as string) ?? "",
          name: (payload.name as string) ?? "",
          order: (payload.order as string) ?? "",
          lastOpId: opId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [syncTabCollections.userId, syncTabCollections.syncId],
          set: { ...fields, lastOpId: opId, updatedAt: timestamp },
          setWhere: lww,
        })
        .run();
    } else {
      const setFields: Record<string, unknown> = {
        ...fields,
        lastOpId: opId,
        updatedAt: timestamp,
      };
      if (action === "delete") setFields.deletedAt = timestamp;

      tx.update(syncTabCollections)
        .set(setFields)
        .where(
          and(
            eq(syncTabCollections.userId, userId),
            eq(syncTabCollections.syncId, entitySyncId),
            lww,
          ),
        )
        .run();
    }
  }

  private applyTabOp(tx: Tx, userId: string, op: PushOp): void {
    const { entitySyncId, action, payload, timestamp, opId } = op;
    const fields = this.pickTabFields(payload);
    const lww = lwwCondition(
      syncCollectionTabs.updatedAt,
      syncCollectionTabs.lastOpId,
      timestamp,
      opId,
    );

    if (action === "create") {
      tx.insert(syncCollectionTabs)
        .values({
          syncId: entitySyncId,
          userId,
          collectionSyncId: (payload.parentSyncId as string) ?? "",
          url: (payload.url as string) ?? "",
          title: (payload.title as string) ?? "",
          favIconUrl: (payload.favIconUrl as string) ?? null,
          order: (payload.order as string) ?? "",
          lastOpId: opId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [syncCollectionTabs.userId, syncCollectionTabs.syncId],
          set: { ...fields, lastOpId: opId, updatedAt: timestamp },
          setWhere: lww,
        })
        .run();
    } else {
      const setFields: Record<string, unknown> = {
        ...fields,
        lastOpId: opId,
        updatedAt: timestamp,
      };
      if (action === "delete") setFields.deletedAt = timestamp;

      tx.update(syncCollectionTabs)
        .set(setFields)
        .where(
          and(
            eq(syncCollectionTabs.userId, userId),
            eq(syncCollectionTabs.syncId, entitySyncId),
            lww,
          ),
        )
        .run();
    }
  }

  private pickWorkspaceFields(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    if ("name" in payload) result.name = payload.name;
    if ("icon" in payload) result.icon = payload.icon;
    if ("viewMode" in payload) result.viewMode = payload.viewMode;
    if ("order" in payload) result.order = payload.order;
    if ("deletedAt" in payload) result.deletedAt = payload.deletedAt;
    return result;
  }

  private pickCollectionFields(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    if ("name" in payload) result.name = payload.name;
    if ("order" in payload) result.order = payload.order;
    if ("parentSyncId" in payload) result.workspaceSyncId = payload.parentSyncId;
    if ("deletedAt" in payload) result.deletedAt = payload.deletedAt;
    return result;
  }

  private pickTabFields(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    if ("url" in payload) result.url = payload.url;
    if ("title" in payload) result.title = payload.title;
    if ("favIconUrl" in payload) result.favIconUrl = payload.favIconUrl;
    if ("parentSyncId" in payload) result.collectionSyncId = payload.parentSyncId;
    if ("order" in payload) result.order = payload.order;
    if ("deletedAt" in payload) result.deletedAt = payload.deletedAt;
    return result;
  }

  async pullChanges(userId: string, cursor: number, limit: number): Promise<PullResult> {
    const rows = this.db
      .select()
      .from(changeLog)
      .where(and(eq(changeLog.userId, userId), gt(changeLog.seq, cursor)))
      .orderBy(changeLog.seq)
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const changes: ChangeEntry[] = rows.slice(0, limit).map((row) => ({
      seq: row.seq,
      entityType: row.entityType,
      entitySyncId: row.entitySyncId,
      action: row.action,
      opId: row.opId,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      createdAt: row.createdAt,
    }));

    const lastSeq = changes.length > 0 ? changes[changes.length - 1]!.seq : cursor;

    return {
      changes,
      cursor: lastSeq,
      hasMore,
      resetRequired: false,
    };
  }

  async getSnapshot(userId: string): Promise<SnapshotResult> {
    const workspaces = this.db
      .select()
      .from(syncWorkspaces)
      .where(eq(syncWorkspaces.userId, userId))
      .all();

    const collections = this.db
      .select()
      .from(syncTabCollections)
      .where(eq(syncTabCollections.userId, userId))
      .all();

    const tabs = this.db
      .select()
      .from(syncCollectionTabs)
      .where(eq(syncCollectionTabs.userId, userId))
      .all();

    // Get max seq for the cursor
    const maxSeqRow = this.db
      .select({ maxSeq: sql<number>`coalesce(max(${changeLog.seq}), 0)` })
      .from(changeLog)
      .where(eq(changeLog.userId, userId))
      .get();

    const cursor = maxSeqRow?.maxSeq ?? 0;

    return { workspaces, collections, tabs, cursor };
  }
}
