export interface PushOp {
  opId: string;
  entityType: "workspace" | "collection" | "tab";
  entitySyncId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface PushResult {
  applied: string[];
  duplicates: string[];
  error?: string;
}

export interface ChangeEntry {
  seq: number;
  entityType: string;
  entitySyncId: string;
  action: string;
  opId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface PullResult {
  changes: ChangeEntry[];
  cursor: number;
  hasMore: boolean;
  resetRequired: boolean;
}

export interface SnapshotResult {
  workspaces: Record<string, unknown>[];
  collections: Record<string, unknown>[];
  tabs: Record<string, unknown>[];
  cursor: number;
}

export interface SyncRepository {
  pushOps(userId: string, ops: PushOp[]): PushResult;
  pullChanges(userId: string, cursor: number, limit: number): PullResult;
  getSnapshot(userId: string): SnapshotResult;
}
