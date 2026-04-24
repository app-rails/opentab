import { pushRequestSchema, pushResponseSchema, SyncErrorCode } from "@opentab/protocol";
import type { ActionFunctionArgs } from "react-router";
import { syncError } from "~/lib/sync-errors";
import { enforceRateLimit, requireDeviceToken, requireProtocolVersion } from "~/middlewares";
import { pushOps } from "~/services/sync.server";

/**
 * `POST /api/sync/push` — batched write endpoint (spec §2.3).
 *
 * Thin adapter: enforces the compat-window + bearer + rate limit, parses the
 * body against `pushRequestSchema`, delegates to the service, then re-parses
 * the response through `pushResponseSchema` so the server cannot silently
 * drift from the wire contract. Per-op cross-field validation
 * (SYNC_ID_MISMATCH, PARENT_NOT_FOUND) lives in `pushOps`.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  requireProtocolVersion(request);
  const auth = await requireDeviceToken(request);
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: auth.userId,
    endpoint: "sync.push",
    max: 10,
    windowSec: 60,
  });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw syncError(SyncErrorCode.INVALID_PAYLOAD, 400, "invalid json body");
  }

  const parsed = pushRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw syncError(SyncErrorCode.INVALID_PAYLOAD, 400, parsed.error.message);
  }

  const result = await pushOps({ userId: auth.userId, deviceId: auth.deviceId }, parsed.data.ops);
  // Shape-guard — throws if the service drifts from the protocol contract.
  return pushResponseSchema.parse(result);
}
