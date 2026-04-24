import {
  exchangeConsumeRequestSchema,
  exchangeConsumeResponseSchema,
  SyncErrorCode,
} from "@opentab/protocol";
import type { ActionFunctionArgs } from "react-router";
import { syncError } from "~/lib/sync-errors";
import { enforceRateLimit } from "~/middlewares";
import { consumeExchange } from "~/services/extension-setup.server";

/**
 * `POST /api/extension/exchange/consume` — single-use exchange handoff
 * (spec §4.1). Public endpoint: the caller is the extension, which
 * authenticates via the `exchangeCode + nonce` pair rather than a device
 * token (the whole point of this call is to mint that token).
 *
 * Rate-limit is IP-scoped rather than user-scoped: we don't know the user
 * until the exchange row resolves.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const ip =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: ip,
    endpoint: "exchange.consume",
    max: 20,
    windowSec: 60,
  });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw syncError(SyncErrorCode.INVALID_PAYLOAD, 400, "invalid json body");
  }
  const parsed = exchangeConsumeRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw syncError(SyncErrorCode.INVALID_PAYLOAD, 400, parsed.error.message);
  }

  // Service throws EXCHANGE_INVALID (409) on replay / expiry / nonce mismatch.
  const result = await consumeExchange({}, parsed.data);
  return exchangeConsumeResponseSchema.parse(result);
}
