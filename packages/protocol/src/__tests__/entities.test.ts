import { describe, expect, it } from "vitest";
import {
  collectionCreatePayloadSchema,
  collectionDeletePayloadSchema,
  collectionUpdatePayloadSchema,
  tabCreatePayloadSchema,
  tabDeletePayloadSchema,
  tabUpdatePayloadSchema,
  workspaceCreatePayloadSchema,
  workspaceDeletePayloadSchema,
  workspaceUpdatePayloadSchema,
} from "../entities";

// Fixture UUID v7 strings used throughout the tests.
const WS_ID = "018f1a2b-3c4d-7abc-8def-0123456789ab";
const COL_ID = "018f1a2b-3c4d-7abc-8def-0123456789ac";
const TAB_ID = "018f1a2b-3c4d-7abc-8def-0123456789ad";
const UUID_V4 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("workspaceCreatePayloadSchema", () => {
  it("accepts a valid create payload", () => {
    const result = workspaceCreatePayloadSchema.safeParse({
      syncId: WS_ID,
      name: "Personal",
      icon: "briefcase",
      viewMode: "default",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("allows icon/viewMode to be omitted", () => {
    const result = workspaceCreatePayloadSchema.safeParse({
      syncId: WS_ID,
      name: "Work",
      order: "a1",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects name longer than 100 chars", () => {
    const result = workspaceCreatePayloadSchema.safeParse({
      syncId: WS_ID,
      name: "x".repeat(101),
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required field", () => {
    const result = workspaceCreatePayloadSchema.safeParse({
      syncId: WS_ID,
      name: "Personal",
      // order missing
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects UUID v4 for syncId", () => {
    const result = workspaceCreatePayloadSchema.safeParse({
      syncId: UUID_V4,
      name: "Personal",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects viewMode that is not in enum", () => {
    const result = workspaceCreatePayloadSchema.safeParse({
      syncId: WS_ID,
      name: "Personal",
      viewMode: "grid",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("workspaceUpdatePayloadSchema", () => {
  it("accepts the same shape as create", () => {
    const result = workspaceUpdatePayloadSchema.safeParse({
      syncId: WS_ID,
      name: "Updated",
      order: "a1",
      updatedAt: 1_700_000_000_001,
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("workspaceDeletePayloadSchema", () => {
  it("accepts tombstone payload (deletedAt as ms)", () => {
    const result = workspaceDeletePayloadSchema.safeParse({
      syncId: WS_ID,
      updatedAt: 1_700_000_000_000,
      deletedAt: 1_700_000_000_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects null deletedAt on delete variant", () => {
    const result = workspaceDeletePayloadSchema.safeParse({
      syncId: WS_ID,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive updatedAt", () => {
    const result = workspaceDeletePayloadSchema.safeParse({
      syncId: WS_ID,
      updatedAt: 0,
      deletedAt: 1_700_000_000_000,
    });
    expect(result.success).toBe(false);
  });
});

describe("collectionCreatePayloadSchema", () => {
  it("accepts a valid payload", () => {
    const result = collectionCreatePayloadSchema.safeParse({
      syncId: COL_ID,
      parentSyncId: WS_ID,
      name: "Research",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed parentSyncId", () => {
    const result = collectionCreatePayloadSchema.safeParse({
      syncId: COL_ID,
      parentSyncId: "not-a-uuid",
      name: "Research",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = collectionCreatePayloadSchema.safeParse({
      syncId: COL_ID,
      parentSyncId: WS_ID,
      name: "",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("collectionUpdatePayloadSchema", () => {
  it("accepts a valid payload", () => {
    const result = collectionUpdatePayloadSchema.safeParse({
      syncId: COL_ID,
      parentSyncId: WS_ID,
      name: "Renamed",
      order: "a1",
      updatedAt: 1_700_000_000_001,
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("collectionDeletePayloadSchema", () => {
  it("accepts tombstone keeping parentSyncId", () => {
    const result = collectionDeletePayloadSchema.safeParse({
      syncId: COL_ID,
      parentSyncId: WS_ID,
      updatedAt: 1_700_000_000_000,
      deletedAt: 1_700_000_000_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing parentSyncId", () => {
    const result = collectionDeletePayloadSchema.safeParse({
      syncId: COL_ID,
      updatedAt: 1_700_000_000_000,
      deletedAt: 1_700_000_000_000,
    });
    expect(result.success).toBe(false);
  });
});

describe("tabCreatePayloadSchema", () => {
  it("accepts a valid payload with all optional fields", () => {
    const result = tabCreatePayloadSchema.safeParse({
      syncId: TAB_ID,
      parentSyncId: COL_ID,
      url: "https://example.com/",
      title: "Example",
      favIconUrl: "https://example.com/favicon.ico",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("allows title/favIconUrl to be omitted", () => {
    const result = tabCreatePayloadSchema.safeParse({
      syncId: TAB_ID,
      parentSyncId: COL_ID,
      url: "https://example.com/",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-http(s) URL", () => {
    const result = tabCreatePayloadSchema.safeParse({
      syncId: TAB_ID,
      parentSyncId: COL_ID,
      url: "ftp://example.com/file",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects url longer than 500 chars", () => {
    const longUrl = `https://example.com/${"a".repeat(500)}`;
    const result = tabCreatePayloadSchema.safeParse({
      syncId: TAB_ID,
      parentSyncId: COL_ID,
      url: longUrl,
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects title longer than 500 chars", () => {
    const result = tabCreatePayloadSchema.safeParse({
      syncId: TAB_ID,
      parentSyncId: COL_ID,
      url: "https://example.com/",
      title: "x".repeat(501),
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("tabUpdatePayloadSchema", () => {
  it("accepts a valid update", () => {
    const result = tabUpdatePayloadSchema.safeParse({
      syncId: TAB_ID,
      parentSyncId: COL_ID,
      url: "https://example.com/",
      title: "Example",
      order: "a1",
      updatedAt: 1_700_000_000_001,
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("tabDeletePayloadSchema", () => {
  it("accepts tombstone keeping parentSyncId", () => {
    const result = tabDeletePayloadSchema.safeParse({
      syncId: TAB_ID,
      parentSyncId: COL_ID,
      updatedAt: 1_700_000_000_000,
      deletedAt: 1_700_000_000_000,
    });
    expect(result.success).toBe(true);
  });
});
