import { SyncErrorCode } from "@opentab/protocol";

/**
 * Minimal KV surface `enforceRateLimit` actually touches. Accepting this
 * subset (rather than the full Cloudflare `KVNamespace`) lets tests pass an
 * in-memory fake without touching `@cloudflare/workers-types`.
 */
export type RateLimitKv = {
  get: (key: string, type: "json") => Promise<unknown>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};

export type RateLimitOpts = {
  kv: RateLimitKv;
  scope: string; // userId or IP
  endpoint: string; // e.g. "sync.push"
  max: number; // requests allowed per window
  windowSec: number; // window length in seconds
};

type Bucket = { count: number; resetAt: number };

/**
 * KV-backed token bucket (spec §2.3.9).
 *
 * Keyed by `rl:<endpoint>:<scope>`, where scope is either the userId (for
 * authenticated endpoints) or the IP (for unauthenticated ones). The bucket
 * stores `{ count, resetAt }` in KV with a TTL equal to the window length so
 * entries evict automatically between runs.
 *
 * Throws a 429 `Response` with a `Retry-After` header when over the limit.
 */
export async function enforceRateLimit(opts: RateLimitOpts): Promise<void> {
  const key = `rl:${opts.endpoint}:${opts.scope}`;
  const now = Math.floor(Date.now() / 1000);
  const raw = (await opts.kv.get(key, "json")) as Bucket | null;

  if (!raw || raw.resetAt <= now) {
    await opts.kv.put(key, JSON.stringify({ count: 1, resetAt: now + opts.windowSec }), {
      expirationTtl: opts.windowSec,
    });
    return;
  }

  if (raw.count >= opts.max) {
    const retryAfter = Math.max(1, raw.resetAt - now);
    throw new Response(
      JSON.stringify({ error: { code: SyncErrorCode.RATE_LIMITED, message: "rate limited" } }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(retryAfter),
        },
      },
    );
  }

  await opts.kv.put(key, JSON.stringify({ count: raw.count + 1, resetAt: raw.resetAt }), {
    expirationTtl: Math.max(1, raw.resetAt - now),
  });
}
