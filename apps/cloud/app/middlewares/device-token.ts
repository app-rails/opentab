import { SyncErrorCode } from "@opentab/protocol";
import { and, eq, isNull } from "drizzle-orm";
import { devices } from "~/drizzle/schema";
import { syncError } from "~/lib/sync-errors";
import { db as defaultDb } from "~/services/db.server";

export type DeviceRow = typeof devices.$inferSelect;

export type DeviceAuth = {
  userId: string;
  deviceId: string;
  device: DeviceRow;
};

// Drizzle query surface we actually touch; lets tests hand in a minimal fake
// without dragging in D1.
export type DeviceTokenDb = {
  select: () => {
    from: (t: unknown) => {
      where: (cond: unknown) => {
        limit: (n: number) => Promise<DeviceRow[]>;
      };
    };
  };
};

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Authoritative identity resolver for sync endpoints (spec §2.3.3).
 *
 * Parses a `Bearer <opaque>` token from the Authorization header, SHA-256
 * hashes it, and looks up a non-revoked `devices` row. Throws a JSON error
 * Response on any failure so the middleware short-circuits cleanly.
 *
 * @throws Response with SyncErrorCode.UNAUTHORIZED when no bearer token
 * @throws Response with SyncErrorCode.DEVICE_NOT_REGISTERED when hash miss or revoked
 */
export async function requireDeviceToken(
  request: Request,
  deps?: { db?: DeviceTokenDb },
): Promise<DeviceAuth> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    throw syncError(SyncErrorCode.UNAUTHORIZED, 401);
  }
  const raw = auth.slice(7);
  if (!raw) {
    throw syncError(SyncErrorCode.UNAUTHORIZED, 401);
  }

  const hash = await sha256Hex(raw);
  const db = deps?.db ?? (defaultDb as unknown as DeviceTokenDb);

  const rows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.tokenHash, hash), isNull(devices.revokedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw syncError(SyncErrorCode.DEVICE_NOT_REGISTERED, 401);
  }

  const row = rows[0] as DeviceRow;
  return { userId: row.userId, deviceId: row.id, device: row };
}
