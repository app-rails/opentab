import { isProdEnv } from "@opentab/config/env/worker";
import { SyncErrorCode, whoamiResponseSchema } from "@opentab/protocol";
import { eq } from "drizzle-orm";
import type { LoaderFunctionArgs } from "react-router";
import { users } from "~/drizzle/schema";
import { syncError } from "~/lib/sync-errors";
import { enforceRateLimit, requireDeviceToken, requireProtocolVersion } from "~/middlewares";
import { db } from "~/services/db.server";

/**
 * `GET /api/sync/whoami`.
 *
 * Token-only identity probe (spec §4.x). The extension calls this on launch
 * for Case 1 auto-reconnect: if the bearer still resolves to a non-revoked
 * device row, return the bound user so the UI can hydrate without a re-link
 * dance. The lookup is one row by primary key, so we inline the query
 * (no service indirection) — see Task 4 plan.
 *
 * Rate-limit budget is tighter than `/stats` (60/min prod, 300/min dev) since
 * this fires on extension boot, not per-render. See `stats.ts` for why these
 * constants live inside `loader` (RR7 tree-shaking + `cloudflare:workers`).
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  requireProtocolVersion(request);
  const auth = await requireDeviceToken(request);
  const max = isProdEnv ? 60 : 300;
  const windowSec = 60;
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: auth.userId,
    endpoint: "sync.whoami",
    max,
    windowSec,
  });

  const rows = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  const row = rows[0];
  if (!row) {
    // Defensive: token resolved to a device whose user row vanished. Should
    // not happen under normal operation (FK + auth flow guarantee). This is a
    // server-side data integrity issue, not an auth failure — surfacing it as
    // 4xx would make the client retry a re-link dance that can't fix the
    // missing row. Surface as 500 INTERNAL so ops sees it and the client
    // backs off instead of churning tokens.
    throw syncError(SyncErrorCode.INTERNAL, 500);
  }

  return whoamiResponseSchema.parse({
    deviceId: auth.deviceId,
    user: { id: row.id, name: row.name, email: row.email },
  });
}
