import { describe, expect, it } from "vitest";
import { pushOpSchema } from "../ops";

const WS_ID = "018f1a2b-3c4d-7abc-8def-0123456789ab";
const COL_ID = "018f1a2b-3c4d-7abc-8def-0123456789ac";
const TAB_ID = "018f1a2b-3c4d-7abc-8def-0123456789ad";
const OP_ID = "018f1a2b-3c4d-7abc-8def-000000000001";

describe("pushOpSchema (discriminated union)", () => {
  it("accepts workspace.create", () => {
    const result = pushOpSchema.safeParse({
      kind: "workspace.create",
      opId: OP_ID,
      entitySyncId: WS_ID,
      payload: {
        syncId: WS_ID,
        name: "Personal",
        order: "a0",
        updatedAt: 1_700_000_000_000,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts workspace.update", () => {
    const result = pushOpSchema.safeParse({
      kind: "workspace.update",
      opId: OP_ID,
      entitySyncId: WS_ID,
      payload: {
        syncId: WS_ID,
        name: "Renamed",
        order: "a1",
        updatedAt: 1_700_000_000_001,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts workspace.delete", () => {
    const result = pushOpSchema.safeParse({
      kind: "workspace.delete",
      opId: OP_ID,
      entitySyncId: WS_ID,
      payload: {
        syncId: WS_ID,
        updatedAt: 1_700_000_000_000,
        deletedAt: 1_700_000_000_000,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts collection.create", () => {
    const result = pushOpSchema.safeParse({
      kind: "collection.create",
      opId: OP_ID,
      entitySyncId: COL_ID,
      payload: {
        syncId: COL_ID,
        parentSyncId: WS_ID,
        name: "Research",
        order: "a0",
        updatedAt: 1_700_000_000_000,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts collection.update", () => {
    const result = pushOpSchema.safeParse({
      kind: "collection.update",
      opId: OP_ID,
      entitySyncId: COL_ID,
      payload: {
        syncId: COL_ID,
        parentSyncId: WS_ID,
        name: "Renamed",
        order: "a1",
        updatedAt: 1_700_000_000_001,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts collection.delete", () => {
    const result = pushOpSchema.safeParse({
      kind: "collection.delete",
      opId: OP_ID,
      entitySyncId: COL_ID,
      payload: {
        syncId: COL_ID,
        parentSyncId: WS_ID,
        updatedAt: 1_700_000_000_000,
        deletedAt: 1_700_000_000_000,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts tab.create", () => {
    const result = pushOpSchema.safeParse({
      kind: "tab.create",
      opId: OP_ID,
      entitySyncId: TAB_ID,
      payload: {
        syncId: TAB_ID,
        parentSyncId: COL_ID,
        url: "https://example.com/",
        title: "Example",
        order: "a0",
        updatedAt: 1_700_000_000_000,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts tab.update", () => {
    const result = pushOpSchema.safeParse({
      kind: "tab.update",
      opId: OP_ID,
      entitySyncId: TAB_ID,
      payload: {
        syncId: TAB_ID,
        parentSyncId: COL_ID,
        url: "https://example.com/",
        order: "a1",
        updatedAt: 1_700_000_000_001,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts tab.delete", () => {
    const result = pushOpSchema.safeParse({
      kind: "tab.delete",
      opId: OP_ID,
      entitySyncId: TAB_ID,
      payload: {
        syncId: TAB_ID,
        parentSyncId: COL_ID,
        updatedAt: 1_700_000_000_000,
        deletedAt: 1_700_000_000_000,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown kind", () => {
    const result = pushOpSchema.safeParse({
      kind: "workspace.foo",
      opId: OP_ID,
      entitySyncId: WS_ID,
      payload: {
        syncId: WS_ID,
        name: "Personal",
        order: "a0",
        updatedAt: 1_700_000_000_000,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched payload shape for kind (delete payload on create kind)", () => {
    const result = pushOpSchema.safeParse({
      kind: "workspace.create",
      opId: OP_ID,
      entitySyncId: WS_ID,
      payload: {
        syncId: WS_ID,
        updatedAt: 1_700_000_000_000,
        deletedAt: 1_700_000_000_000, // wrong type for create variant
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed opId", () => {
    const result = pushOpSchema.safeParse({
      kind: "workspace.create",
      opId: "not-a-uuid",
      entitySyncId: WS_ID,
      payload: {
        syncId: WS_ID,
        name: "Personal",
        order: "a0",
        updatedAt: 1_700_000_000_000,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(false);
  });

  it("does NOT enforce payload.syncId === entitySyncId at zod layer", () => {
    // The spec says this invariant is enforced server-side after parse.
    // Here we assert zod accepts the mismatch (so the server can respond
    // with a distinct SYNC_ID_MISMATCH code instead of a generic zod error).
    const OTHER_ID = "018f1a2b-3c4d-7abc-8def-0123456789ff";
    const result = pushOpSchema.safeParse({
      kind: "workspace.create",
      opId: OP_ID,
      entitySyncId: WS_ID,
      payload: {
        syncId: OTHER_ID,
        name: "Personal",
        order: "a0",
        updatedAt: 1_700_000_000_000,
        deletedAt: null,
      },
    });
    expect(result.success).toBe(true);
  });
});
