import { describe, expect, it } from "vitest";
import { app } from "../app.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createAuthenticatedUser() {
  const res = await app.request("/api/auth/sign-in/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as { token: string; user: { id: string } };
  return { token: data.token, userId: data.user.id };
}

async function pushOps(token: string, ops: Record<string, unknown>[]) {
  const res = await app.request("/trpc/sync.push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ops }),
  });
  const data = (await res.json()) as { result: { data: unknown } };
  return data.result.data as {
    applied: string[];
    duplicates: string[];
    error?: string;
  };
}

async function pullChanges(token: string, cursor: number, limit = 100) {
  const res = await app.request(
    `/trpc/sync.pull?input=${encodeURIComponent(JSON.stringify({ cursor, limit }))}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as { result: { data: unknown } };
  return data.result.data as {
    changes: {
      seq: number;
      entityType: string;
      entitySyncId: string;
      action: string;
      opId: string;
      payload: Record<string, unknown>;
      createdAt: number;
    }[];
    cursor: number;
    hasMore: boolean;
    resetRequired: boolean;
  };
}

async function getSnapshot(token: string) {
  const res = await app.request("/trpc/sync.snapshot", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { result: { data: unknown } };
  return data.result.data as {
    workspaces: Record<string, unknown>[];
    collections: Record<string, unknown>[];
    tabs: Record<string, unknown>[];
    cursor: number;
  };
}

function makeCreateOp(syncId: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    opId: crypto.randomUUID(),
    entitySyncId: syncId,
    entityType: "workspace" as const,
    action: "create" as const,
    timestamp: now,
    payload: {
      syncId,
      name: "Test WS",
      icon: "folder",
      order: "a0",
      ...overrides,
    },
  };
}

function makeUpdateOp(syncId: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    opId: crypto.randomUUID(),
    entitySyncId: syncId,
    entityType: "workspace" as const,
    action: "update" as const,
    timestamp: now,
    payload: {
      syncId,
      name: "Updated",
      icon: "folder",
      order: "a0",
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sync API", () => {
  // 1. Push + Pull roundtrip
  it("push a workspace and pull it back", async () => {
    const { token } = await createAuthenticatedUser();
    const syncId = crypto.randomUUID();
    const op = makeCreateOp(syncId, { name: "My Workspace" });

    const pushResult = await pushOps(token, [op]);
    expect(pushResult.applied).toContain(op.opId);
    expect(pushResult.duplicates).toHaveLength(0);

    const pullResult = await pullChanges(token, 0);
    expect(pullResult.changes.length).toBeGreaterThanOrEqual(1);

    const found = pullResult.changes.find((c) => c.entitySyncId === syncId);
    expect(found).toBeDefined();
    expect(found!.action).toBe("create");
    expect(found!.payload.name).toBe("My Workspace");
  });

  // 2. Push idempotent — same opId twice
  it("push same opId twice → accepted first time, duplicate second time", async () => {
    const { token } = await createAuthenticatedUser();
    const syncId = crypto.randomUUID();
    const op = makeCreateOp(syncId);

    const first = await pushOps(token, [op]);
    expect(first.applied).toContain(op.opId);
    expect(first.duplicates).toHaveLength(0);

    const second = await pushOps(token, [op]);
    expect(second.duplicates).toContain(op.opId);
    expect(second.applied).toHaveLength(0);
  });

  // 3. Push LWW — newer timestamp wins
  it("push updatedAt=200 then updatedAt=100 → entity keeps name from 200", async () => {
    const { token } = await createAuthenticatedUser();
    const syncId = crypto.randomUUID();

    // Create the workspace with a low timestamp so updates can win
    const createOp = makeCreateOp(syncId, { name: "Original" });
    createOp.timestamp = 50;
    await pushOps(token, [createOp]);

    // Update with timestamp 200 (newer than create)
    const updateNewer = makeUpdateOp(syncId, { name: "Newer" });
    updateNewer.timestamp = 200;
    await pushOps(token, [updateNewer]);

    // Update with timestamp 100 (older than 200) — should be rejected by LWW
    const updateOlder = makeUpdateOp(syncId, { name: "Older" });
    updateOlder.timestamp = 100;
    await pushOps(token, [updateOlder]);

    // Snapshot should show "Newer"
    const snapshot = await getSnapshot(token);
    const ws = snapshot.workspaces.find((w) => w.syncId === syncId);
    expect(ws).toBeDefined();
    expect(ws!.name).toBe("Newer");
  });

  // 4. Push LWW tie-break — same timestamp, higher opId wins
  it("same timestamp, higher opId string wins", async () => {
    const { token } = await createAuthenticatedUser();
    const syncId = crypto.randomUUID();

    // Create the workspace with a low timestamp so updates can win
    const createOp = makeCreateOp(syncId, { name: "Original" });
    createOp.timestamp = 50;
    await pushOps(token, [createOp]);

    const ts = 500;

    // Craft two updates with deterministic opIds so we know which is "higher"
    const updateA = makeUpdateOp(syncId, { name: "Alpha" });
    updateA.timestamp = ts;
    updateA.opId = "aaaaaaaa-0000-0000-0000-000000000000";

    const updateZ = makeUpdateOp(syncId, { name: "Zulu" });
    updateZ.timestamp = ts;
    updateZ.opId = "zzzzzzzz-0000-0000-0000-000000000000";

    // Push Z first, then A — A should lose because opId "aaa..." < "zzz..."
    await pushOps(token, [updateZ]);
    await pushOps(token, [updateA]);

    const snapshot = await getSnapshot(token);
    const ws = snapshot.workspaces.find((w) => w.syncId === syncId);
    expect(ws).toBeDefined();
    expect(ws!.name).toBe("Zulu");
  });

  // 5. Pull cursor — push 3 ops, pull(cursor=0) → 3 changes, pull again → 0
  it("pull with cursor returns incremental changes", async () => {
    const { token } = await createAuthenticatedUser();

    const ops = [
      makeCreateOp(crypto.randomUUID(), { name: "WS1" }),
      makeCreateOp(crypto.randomUUID(), { name: "WS2" }),
      makeCreateOp(crypto.randomUUID(), { name: "WS3" }),
    ];
    await pushOps(token, ops);

    const pull1 = await pullChanges(token, 0);
    expect(pull1.changes).toHaveLength(3);
    expect(pull1.cursor).toBeGreaterThan(0);

    // Pull again from the returned cursor — should get 0 new changes
    const pull2 = await pullChanges(token, pull1.cursor);
    expect(pull2.changes).toHaveLength(0);
    expect(pull2.cursor).toBe(pull1.cursor);
  });

  // 6. Snapshot — push data, verify snapshot includes all entities
  it("snapshot returns all pushed entities", async () => {
    const { token } = await createAuthenticatedUser();

    const wsSyncId = crypto.randomUUID();
    const wsOp = makeCreateOp(wsSyncId, { name: "Snap WS" });
    await pushOps(token, [wsOp]);

    const snapshot = await getSnapshot(token);
    expect(snapshot.workspaces.length).toBeGreaterThanOrEqual(1);
    const ws = snapshot.workspaces.find((w) => w.syncId === wsSyncId);
    expect(ws).toBeDefined();
    expect(ws!.name).toBe("Snap WS");
    expect(snapshot.cursor).toBeGreaterThan(0);
  });

  // 7. Push payload validation — mismatched syncId
  it("mismatched payload.syncId vs entitySyncId returns error", async () => {
    const { token } = await createAuthenticatedUser();
    const syncId = crypto.randomUUID();
    const op = makeCreateOp(syncId);
    // Mismatch: payload.syncId differs from entitySyncId
    op.payload.syncId = crypto.randomUUID();

    const res = await app.request("/trpc/sync.push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ops: [op] }),
    });

    // tRPC returns an error — could be 400 or wrapped in error shape
    const data = (await res.json()) as { error?: { message?: string } };
    expect(data.error).toBeDefined();
    expect(data.error!.message).toContain("payload.syncId");
  });

  // 8. Push create conflict — same syncId, different opId → onConflictDoUpdate + LWW
  it("create with same syncId but different opId uses LWW to resolve", async () => {
    const { token } = await createAuthenticatedUser();
    const syncId = crypto.randomUUID();

    // First create at timestamp 100
    const op1 = makeCreateOp(syncId, { name: "First" });
    op1.timestamp = 100;
    const res1 = await pushOps(token, [op1]);
    expect(res1.applied).toContain(op1.opId);

    // Second create with same syncId but newer timestamp
    const op2 = makeCreateOp(syncId, { name: "Second" });
    op2.timestamp = 200;
    const res2 = await pushOps(token, [op2]);
    expect(res2.applied).toContain(op2.opId);

    // The entity should have the name from the newer timestamp
    const snapshot = await getSnapshot(token);
    const ws = snapshot.workspaces.find((w) => w.syncId === syncId);
    expect(ws).toBeDefined();
    expect(ws!.name).toBe("Second");
  });

  // Additional: unauthenticated access is rejected
  it("push without auth token returns error", async () => {
    const res = await app.request("/trpc/sync.push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops: [makeCreateOp(crypto.randomUUID())] }),
    });
    expect(res.ok).toBe(false);
  });

  // Additional: user isolation — user A cannot see user B's data
  it("user A cannot see user B's workspaces", async () => {
    const userA = await createAuthenticatedUser();
    const userB = await createAuthenticatedUser();

    const syncId = crypto.randomUUID();
    await pushOps(userA.token, [makeCreateOp(syncId, { name: "A's workspace" })]);

    const snapshotB = await getSnapshot(userB.token);
    const found = snapshotB.workspaces.find((w) => w.syncId === syncId);
    expect(found).toBeUndefined();
  });
});
