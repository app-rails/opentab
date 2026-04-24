import { SyncErrorCode } from "@opentab/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeviceRow, type DeviceTokenDb, requireDeviceToken } from "../device-token";

function makeDb(rows: DeviceRow[]): DeviceTokenDb {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  };
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/sync/push", { headers });
}

const sampleRow: DeviceRow = {
  id: "device-1",
  userId: "user-1",
  name: "test-device",
  platform: "chromium",
  extensionVersion: "0.2.0",
  // sha256("token-123") — not strictly needed for the mock but matches prod shape
  tokenHash: "x".repeat(64),
  createdAt: new Date(0),
  lastSeenAt: new Date(0),
  revokedAt: null,
};

describe("requireDeviceToken", () => {
  let db: DeviceTokenDb;
  beforeEach(() => {
    db = makeDb([sampleRow]);
  });

  it("throws UNAUTHORIZED when authorization header is missing", async () => {
    const req = makeRequest();
    await expect(requireDeviceToken(req, { db })).rejects.toBeInstanceOf(Response);
    try {
      await requireDeviceToken(req, { db });
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.UNAUTHORIZED);
    }
  });

  it("throws UNAUTHORIZED when header does not start with Bearer", async () => {
    const req = makeRequest({ authorization: "Basic abc" });
    try {
      await requireDeviceToken(req, { db });
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.UNAUTHORIZED);
    }
  });

  it("throws UNAUTHORIZED when bearer value is empty", async () => {
    const req = makeRequest({ authorization: "Bearer " });
    try {
      await requireDeviceToken(req, { db });
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.UNAUTHORIZED);
    }
  });

  it("throws DEVICE_NOT_REGISTERED when hash has no matching row", async () => {
    const emptyDb = makeDb([]);
    const req = makeRequest({ authorization: "Bearer unknown-token" });
    try {
      await requireDeviceToken(req, { db: emptyDb });
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.DEVICE_NOT_REGISTERED);
    }
  });

  it("throws DEVICE_NOT_REGISTERED for revoked rows (query filters them out)", async () => {
    // Our middleware passes `isNull(revokedAt)` to the where clause; the mock
    // honors that semantically by returning an empty row set when the caller
    // would never see a revoked row. Emulate that by returning [].
    const emptyDb = makeDb([]);
    const req = makeRequest({ authorization: "Bearer revoked-token" });
    try {
      await requireDeviceToken(req, { db: emptyDb });
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.DEVICE_NOT_REGISTERED);
    }
  });

  it("returns DeviceAuth when a matching non-revoked row exists", async () => {
    const req = makeRequest({ authorization: "Bearer valid-token" });
    const result = await requireDeviceToken(req, { db });
    expect(result.userId).toBe("user-1");
    expect(result.deviceId).toBe("device-1");
    expect(result.device).toBe(sampleRow);
  });
});
