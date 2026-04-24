/**
 * Devices service — consumed by the `/devices` and `/devices/:id` web routes.
 *
 * The layer above (RR7 loader/action) is responsible for cookie-authing the
 * caller and resolving their userId; we only care about per-user scoping.
 */

import type { devices } from "~/drizzle/schema";
import { db as defaultDb } from "~/services/db.server";
import { listDevicesForUser, revokeDeviceById } from "~/services/devices-repo.server";
import type { Db } from "~/services/sync-repo.server";

type DeviceRow = typeof devices.$inferSelect;

/**
 * UI-safe projection of a device row. Intentionally strips `tokenHash`
 * (never returned to the browser) but preserves `revokedAt` so the UI can
 * render status badges. Dates are emitted as ms timestamps so the client
 * side can reason about them without TZ ambiguity.
 */
export type DeviceView = {
  id: string;
  userId: string;
  name: string;
  platform: string | null;
  extensionVersion: string | null;
  createdAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
};

export type DevicesCtx = {
  userId: string;
  db?: Db;
};

function resolveDb(ctx: DevicesCtx): Db {
  return ctx.db ?? (defaultDb as unknown as Db);
}

function toView(row: DeviceRow): DeviceView {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    platform: row.platform ?? null,
    extensionVersion: row.extensionVersion ?? null,
    createdAt: row.createdAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
    revokedAt: row.revokedAt ? row.revokedAt.getTime() : null,
  };
}

/**
 * Return every device (active + revoked) belonging to the caller. UI owns
 * the "show revoked" toggle since the full list is cheap enough to fetch.
 */
export async function listDevices(ctx: DevicesCtx): Promise<DeviceView[]> {
  const rows = await listDevicesForUser(resolveDb(ctx), ctx.userId);
  return rows.map(toView);
}

/**
 * Revoke a single device. Idempotent — revoking an unknown / already-revoked
 * device is a no-op from the caller's perspective, so we swallow the "false"
 * return from the repo instead of surfacing a 404.
 */
export async function revokeDevice(ctx: DevicesCtx, deviceId: string): Promise<void> {
  await revokeDeviceById(resolveDb(ctx), ctx.userId, deviceId);
}
