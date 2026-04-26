import { describe, expect, it } from "vitest";
import {
  exchangeConsumeRequestSchema,
  exchangeConsumeResponseSchema,
} from "../endpoints/exchange-consume";
import { healthResponseSchema } from "../endpoints/health";
import { pullRequestSchema, pullResponseSchema } from "../endpoints/pull";
import { pushRequestSchema, pushResponseSchema } from "../endpoints/push";
import { snapshotResponseSchema } from "../endpoints/snapshot";
import { SyncErrorCode } from "../errors";

const WS_ID = "018f1a2b-3c4d-7abc-8def-0123456789ab";
const COL_ID = "018f1a2b-3c4d-7abc-8def-0123456789ac";
const TAB_ID = "018f1a2b-3c4d-7abc-8def-0123456789ad";
const DEVICE_ID = "018f1a2b-3c4d-7abc-8def-0123456789de";
const OP_ID = "018f1a2b-3c4d-7abc-8def-000000000001";

describe("healthResponseSchema", () => {
  it("parses a valid health response", () => {
    const result = healthResponseSchema.safeParse({
      serverVersion: "1.2.3",
      protocolVersion: "1.0.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty serverVersion", () => {
    const result = healthResponseSchema.safeParse({
      serverVersion: "",
      protocolVersion: "1.0.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when protocolVersion is missing", () => {
    const result = healthResponseSchema.safeParse({ serverVersion: "1.2.3" });
    expect(result.success).toBe(false);
  });
});

describe("pushRequestSchema", () => {
  const validOp = {
    kind: "workspace.create" as const,
    opId: OP_ID,
    entitySyncId: WS_ID,
    payload: {
      syncId: WS_ID,
      name: "Personal",
      order: "a0",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    },
  };

  it("accepts a push with 1 op", () => {
    const result = pushRequestSchema.safeParse({ ops: [validOp] });
    expect(result.success).toBe(true);
  });

  it("rejects empty ops array", () => {
    const result = pushRequestSchema.safeParse({ ops: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a batch larger than MAX_BATCH_SIZE", () => {
    const ops = Array.from({ length: 101 }, () => validOp);
    const result = pushRequestSchema.safeParse({ ops });
    expect(result.success).toBe(false);
  });

  it("strips unknown `deviceId` field from request body (default .object behavior)", () => {
    // Per spec §2.3 push does NOT carry deviceId; the server derives it
    // from the Bearer token. We rely on zod's default strip behavior rather
    // than `.strict()` so a stale client sending deviceId doesn't 400.
    const result = pushRequestSchema.safeParse({
      ops: [validOp],
      deviceId: "leaked-from-old-client",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("deviceId");
      expect(result.data.ops).toHaveLength(1);
    }
  });
});

describe("pushResponseSchema", () => {
  it("accepts a response with three buckets populated and no error", () => {
    const result = pushResponseSchema.safeParse({
      applied: ["op-1"],
      duplicates: ["op-2"],
      lwwSkipped: ["op-3"],
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a response with a retryable error", () => {
    const result = pushResponseSchema.safeParse({
      applied: [],
      duplicates: [],
      lwwSkipped: [],
      error: {
        opId: "op-1",
        code: SyncErrorCode.INTERNAL,
        message: "db write failed",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an error with unknown code", () => {
    const result = pushResponseSchema.safeParse({
      applied: [],
      duplicates: [],
      lwwSkipped: [],
      error: {
        opId: "op-1",
        code: "MYSTERY_CODE",
        message: "???",
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("pullRequestSchema", () => {
  it("accepts cursor 0 without limit", () => {
    const result = pullRequestSchema.safeParse({ cursor: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts a cursor + limit", () => {
    const result = pullRequestSchema.safeParse({ cursor: 42, limit: 50 });
    expect(result.success).toBe(true);
  });

  it("rejects negative cursor", () => {
    const result = pullRequestSchema.safeParse({ cursor: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects limit over MAX_BATCH_SIZE", () => {
    const result = pullRequestSchema.safeParse({ cursor: 0, limit: 101 });
    expect(result.success).toBe(false);
  });
});

describe("pullResponseSchema", () => {
  it("parses a response with one change entry", () => {
    const result = pullResponseSchema.safeParse({
      changes: [
        {
          seq: 1,
          entityType: "workspace",
          entitySyncId: WS_ID,
          action: "create",
          opId: OP_ID,
          payload: { name: "Personal" },
          createdAt: 1_700_000_000_000,
          deviceId: DEVICE_ID,
        },
      ],
      cursor: 1,
      hasMore: false,
      resetRequired: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null deviceId on a change entry", () => {
    const result = pullResponseSchema.safeParse({
      changes: [
        {
          seq: 1,
          entityType: "tab",
          entitySyncId: TAB_ID,
          action: "delete",
          opId: OP_ID,
          payload: {},
          createdAt: 1_700_000_000_000,
          deviceId: null,
        },
      ],
      cursor: 1,
      hasMore: true,
      resetRequired: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown entityType", () => {
    const result = pullResponseSchema.safeParse({
      changes: [
        {
          seq: 1,
          entityType: "note",
          entitySyncId: WS_ID,
          action: "create",
          opId: OP_ID,
          payload: {},
          createdAt: 1_700_000_000_000,
          deviceId: null,
        },
      ],
      cursor: 1,
      hasMore: false,
      resetRequired: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("snapshotResponseSchema", () => {
  it("parses a full snapshot including soft-deleted items", () => {
    const result = snapshotResponseSchema.safeParse({
      workspaces: [
        {
          syncId: WS_ID,
          name: "Personal",
          icon: "briefcase",
          viewMode: "default",
          order: "a0",
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          deletedAt: null,
        },
        {
          syncId: "018f1a2b-3c4d-7abc-8def-01234567ffff",
          name: "Archived",
          icon: null,
          viewMode: null,
          order: "a1",
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_100,
          deletedAt: 1_700_000_000_100,
        },
      ],
      collections: [
        {
          syncId: COL_ID,
          parentSyncId: WS_ID,
          name: "Research",
          order: "a0",
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          deletedAt: null,
        },
      ],
      tabs: [
        {
          syncId: TAB_ID,
          parentSyncId: COL_ID,
          url: "https://example.com/",
          title: "Example",
          favIconUrl: null,
          order: "a0",
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          deletedAt: null,
        },
      ],
      cursor: 42,
    });
    expect(result.success).toBe(true);
  });
});

describe("exchangeConsumeRequestSchema", () => {
  it("parses a valid request", () => {
    const result = exchangeConsumeRequestSchema.safeParse({
      exchangeCode: "abc",
      nonce: "xyz",
      deviceId: DEVICE_ID,
      deviceName: "Liang's MacBook",
      platform: "macOS 15.1 / Chrome 131",
      extensionVersion: "1.0.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-v7 deviceId", () => {
    const result = exchangeConsumeRequestSchema.safeParse({
      exchangeCode: "abc",
      nonce: "xyz",
      deviceId: "f47ac10b-58cc-4372-a567-0e02b2c3d479", // v4
      deviceName: "Liang's MacBook",
      platform: "macOS",
      extensionVersion: "1.0.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects deviceName over 100 chars", () => {
    const result = exchangeConsumeRequestSchema.safeParse({
      exchangeCode: "abc",
      nonce: "xyz",
      deviceId: DEVICE_ID,
      deviceName: "x".repeat(101),
      platform: "macOS",
      extensionVersion: "1.0.0",
    });
    expect(result.success).toBe(false);
  });
});

describe("exchangeConsumeResponseSchema", () => {
  it("parses a valid response with nullable user.name", () => {
    const result = exchangeConsumeResponseSchema.safeParse({
      deviceId: DEVICE_ID,
      deviceToken: "tok_xxxxxxxxxxxxxx",
      deviceName: "Liang's MacBook",
      user: {
        id: "user_abc",
        email: "liang@example.com",
        name: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects when user.id is empty", () => {
    const result = exchangeConsumeResponseSchema.safeParse({
      deviceId: DEVICE_ID,
      deviceToken: "tok",
      deviceName: "Laptop",
      user: {
        id: "",
        email: "a@b.com",
        name: "A",
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("SyncErrorCode", () => {
  it("exposes every documented code", () => {
    expect(SyncErrorCode.API_VERSION_MISMATCH).toBe("API_VERSION_MISMATCH");
    expect(SyncErrorCode.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(SyncErrorCode.DEVICE_NOT_REGISTERED).toBe("DEVICE_NOT_REGISTERED");
    expect(SyncErrorCode.EXCHANGE_INVALID).toBe("EXCHANGE_INVALID");
    expect(SyncErrorCode.INVALID_PAYLOAD).toBe("INVALID_PAYLOAD");
    expect(SyncErrorCode.SYNC_ID_MISMATCH).toBe("SYNC_ID_MISMATCH");
    expect(SyncErrorCode.PARENT_NOT_FOUND).toBe("PARENT_NOT_FOUND");
    expect(SyncErrorCode.CROSS_USER_REFERENCE).toBe("CROSS_USER_REFERENCE");
    expect(SyncErrorCode.RATE_LIMITED).toBe("RATE_LIMITED");
    expect(SyncErrorCode.INTERNAL).toBe("INTERNAL");
  });
});
