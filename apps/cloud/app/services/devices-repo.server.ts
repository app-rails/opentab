/**
 * Devices repository — D1 access for the devices table.
 *
 * See `sync-repo.server.ts` for the repository invariants (first-arg db,
 * batch-first, no JOIN, mandatory user_id filter where applicable).
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { devices } from "~/drizzle/schema";
import type { Db } from "./sync-repo.server";

/**
 * Return every device row for the user, including revoked ones. The web UI
 * wants the full list by default (with an in-page "show revoked" toggle),
 * so filtering is delegated to the caller.
 */
export async function listDevicesForUser(
  db: Db,
  userId: string,
): Promise<(typeof devices.$inferSelect)[]> {
  return db
    .select()
    .from(devices)
    .where(eq(devices.userId, userId))
    .orderBy(desc(devices.lastSeenAt));
}

/**
 * Mark the device revoked (idempotent). Returns `true` if the caller's row
 * transitioned from active → revoked, `false` if the device doesn't exist
 * or was already revoked — both cases are safe for the service layer to
 * treat as a successful no-op.
 */
export async function revokeDeviceById(db: Db, userId: string, deviceId: string): Promise<boolean> {
  const res = await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(and(eq(devices.userId, userId), eq(devices.id, deviceId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  return res.length > 0;
}

/**
 * Primary device-token lookup used by the sync Bearer auth middleware.
 * `revokedAt` filter is part of the index filter so a revoked device cannot
 * come back to life without an exchange round-trip.
 */
export async function findDeviceByTokenHash(
  db: Db,
  tokenHash: string,
): Promise<typeof devices.$inferSelect | null> {
  const rows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.tokenHash, tokenHash), isNull(devices.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}
