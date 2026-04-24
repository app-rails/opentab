import type { PushOp } from "@opentab/protocol";
import { SyncErrorCode } from "@opentab/protocol";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the `vi.mock` factory below closes over the same reference.
const { pushOpsMock } = vi.hoisted(() => ({ pushOpsMock: vi.fn() }));

// Mock the service module — the route is a thin wrapper and the service is
// already covered by its own tests. These tests only verify wiring.
vi.mock("~/services/sync.server", () => ({
  pushOps: pushOpsMock,
}));

// Mock device-token middleware so we can control the resolved identity
// without seeding a real device row.
const { requireDeviceTokenMock } = vi.hoisted(() => ({ requireDeviceTokenMock: vi.fn() }));
vi.mock("~/middlewares", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/middlewares")>();
  return {
    ...original,
    requireDeviceToken: requireDeviceTokenMock,
  };
});

import { action } from "../push";

type ActionArgs = Parameters<typeof action>[0];

function makeKv() {
  const store: Record<string, string> = {};
  return {
    get: async (key: string) => {
      const raw = store[key];
      return raw ? JSON.parse(raw) : null;
    },
    put: async (key: string, value: string) => {
      store[key] = value;
    },
  };
}

function makeContext(): ActionArgs["context"] {
  return {
    cloudflare: {
      env: { APP_KV: makeKv() } as unknown as Env,
      ctx: {} as ExecutionContext,
    },
  } as unknown as ActionArgs["context"];
}

function callAction(request: Request, context: ActionArgs["context"]) {
  return action({ request, context, params: {} } as unknown as ActionArgs);
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/sync/push", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "x-opentab-protocol-version": "1.0.0",
      "x-opentab-extension-version": "0.2.0",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeOp(): PushOp {
  const syncId = uuidv7();
  return {
    kind: "workspace.create",
    opId: uuidv7(),
    entitySyncId: syncId,
    payload: {
      syncId,
      name: "W",
      order: "a0",
      updatedAt: 1000,
      deletedAt: null,
    },
  };
}

describe("POST /api/sync/push", () => {
  beforeEach(() => {
    pushOpsMock.mockReset();
    requireDeviceTokenMock.mockReset();
    requireDeviceTokenMock.mockResolvedValue({
      userId: "u1",
      deviceId: "d1",
      device: {},
    });
  });

  it("happy path: validates the body, calls pushOps, returns the applied bucket", async () => {
    const op = makeOp();
    pushOpsMock.mockResolvedValue({
      applied: [op.opId],
      duplicates: [],
      lwwSkipped: [],
      error: null,
    });

    const response = (await callAction(makeRequest({ ops: [op] }), makeContext())) as unknown;

    // The route returns the plain parsed object; RR7 serializes it on the wire.
    expect(response).toEqual({
      applied: [op.opId],
      duplicates: [],
      lwwSkipped: [],
      error: null,
    });
    expect(pushOpsMock).toHaveBeenCalledWith({ userId: "u1", deviceId: "d1" }, [op]);
  });

  it("throws 400 INVALID_PAYLOAD when the body is not JSON", async () => {
    const request = new Request("http://localhost/api/sync/push", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "x-opentab-protocol-version": "1.0.0",
        "x-opentab-extension-version": "0.2.0",
        "content-type": "application/json",
      },
      body: "not-json",
    });
    try {
      await callAction(request, makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.INVALID_PAYLOAD);
    }
  });

  it("throws 400 INVALID_PAYLOAD when the body shape is wrong", async () => {
    try {
      await callAction(makeRequest({ ops: [] }), makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.INVALID_PAYLOAD);
    }
    expect(pushOpsMock).not.toHaveBeenCalled();
  });

  it("throws 426 when the protocol-version header is missing", async () => {
    const request = new Request("http://localhost/api/sync/push", {
      method: "POST",
      headers: {
        authorization: "Bearer t",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ops: [makeOp()] }),
    });
    try {
      await callAction(request, makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(426);
    }
  });
});
