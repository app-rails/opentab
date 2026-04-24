import { SyncErrorCode } from "@opentab/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceRateLimit, type RateLimitKv } from "../rate-limit";

function makeKv(): RateLimitKv & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string, _type: "json") => {
      const v = store.get(key);
      return v == null ? null : JSON.parse(v);
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("enforceRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to max then throws RATE_LIMITED", async () => {
    const kv = makeKv();
    const opts = { kv, scope: "user-1", endpoint: "sync.push", max: 3, windowSec: 60 };

    // first 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      await expect(enforceRateLimit(opts)).resolves.toBeUndefined();
    }

    // 4th should throw 429 Response
    try {
      await enforceRateLimit(opts);
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBeTruthy();
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.RATE_LIMITED);
    }
  });

  it("refills after the window elapses", async () => {
    const kv = makeKv();
    const opts = { kv, scope: "user-1", endpoint: "sync.push", max: 2, windowSec: 30 };

    await enforceRateLimit(opts);
    await enforceRateLimit(opts);

    // next call hits the cap
    await expect(enforceRateLimit(opts)).rejects.toBeInstanceOf(Response);

    // advance beyond window
    vi.advanceTimersByTime(31_000);

    // bucket resets; should succeed again
    await expect(enforceRateLimit(opts)).resolves.toBeUndefined();
    await expect(enforceRateLimit(opts)).resolves.toBeUndefined();
    await expect(enforceRateLimit(opts)).rejects.toBeInstanceOf(Response);
  });

  it("isolates buckets per (endpoint, scope)", async () => {
    const kv = makeKv();
    const userA = { kv, scope: "a", endpoint: "sync.push", max: 1, windowSec: 60 };
    const userB = { kv, scope: "b", endpoint: "sync.push", max: 1, windowSec: 60 };
    const userAPull = { kv, scope: "a", endpoint: "sync.pull", max: 1, windowSec: 60 };

    await enforceRateLimit(userA);
    await expect(enforceRateLimit(userA)).rejects.toBeInstanceOf(Response);

    // different scope, same endpoint — fresh bucket
    await expect(enforceRateLimit(userB)).resolves.toBeUndefined();

    // same scope, different endpoint — fresh bucket
    await expect(enforceRateLimit(userAPull)).resolves.toBeUndefined();
  });

  it("sets Retry-After to the remaining window", async () => {
    const kv = makeKv();
    const opts = { kv, scope: "user-1", endpoint: "sync.push", max: 1, windowSec: 30 };

    await enforceRateLimit(opts);

    // 10s later, 20s remain in the window
    vi.advanceTimersByTime(10_000);

    try {
      await enforceRateLimit(opts);
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "0", 10);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(30);
    }
  });
});
