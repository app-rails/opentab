/**
 * Extension setup exchange repository — D1 access for the one-time-code
 * handoff between the authenticated browser tab and the extension.
 *
 * See `sync-repo.server.ts` for repository invariants.
 */

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { devices, extensionSetupExchanges } from "~/drizzle/schema";
import type { Db } from "./sync-repo.server";

export async function insertExchange(
  db: Db,
  row: typeof extensionSetupExchanges.$inferInsert,
): Promise<void> {
  await db.insert(extensionSetupExchanges).values(row);
}

/**
 * Atomically mark a pending exchange as consumed and return it. The
 * `code_hash = ? AND consumed_at IS NULL AND expires_at > ?` guard is
 * enforced in SQL so replay attempts either return `null` (already
 * consumed or expired) or get the row as the single witness — there is
 * never a race window between a SELECT and an UPDATE.
 */
export async function consumeExchangeByCodeHash(
  db: Db,
  codeHash: string,
  now: number,
): Promise<typeof extensionSetupExchanges.$inferSelect | null> {
  // `sql` takes a ms timestamp param so we stay consistent with the
  // timestamp_ms mode the schema declares for `expires_at`.
  const res = await db
    .update(extensionSetupExchanges)
    .set({ consumedAt: new Date(now) })
    .where(
      and(
        eq(extensionSetupExchanges.codeHash, codeHash),
        isNull(extensionSetupExchanges.consumedAt),
        gt(extensionSetupExchanges.expiresAt, sql`${now}`),
      ),
    )
    .returning();
  return res[0] ?? null;
}

/**
 * Upsert the device row keyed by `id`. Rotating the token on re-authorization
 * preserves historical audit state (same row, same `createdAt`) while
 * letting the extension recover after local credential loss. Also clears
 * `revoked_at` — a successful consume is treated as the user re-authorizing
 * that device.
 */
export async function upsertDeviceByIdRotatingToken(
  db: Db,
  row: typeof devices.$inferInsert,
): Promise<void> {
  await db
    .insert(devices)
    .values(row)
    .onConflictDoUpdate({
      target: devices.id,
      set: {
        tokenHash: row.tokenHash,
        name: row.name,
        platform: row.platform ?? null,
        extensionVersion: row.extensionVersion ?? null,
        lastSeenAt: row.lastSeenAt ?? new Date(),
        revokedAt: null,
      },
    });
}
