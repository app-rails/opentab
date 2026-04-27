import {
  type ExchangeConsumeRequest,
  type ExchangeConsumeResponse,
  exchangeConsumeRequestSchema,
  exchangeConsumeResponseSchema,
  type HealthResponse,
  healthResponseSchema,
  PROTOCOL_VERSION,
  type PullResponse,
  type PushOp,
  type PushResponse,
  pullResponseSchema,
  pushResponseSchema,
  type SnapshotResponse,
  SyncErrorCode,
  snapshotResponseSchema,
} from "@opentab/protocol";
import { MSG } from "./constants";
import { type SyncSettings, setSyncSettings } from "./sync-settings";

/**
 * Structural schema interface — avoids a direct `zod` dependency in the
 * extension. Every schema surfaced from `@opentab/protocol` supplies a
 * `.parse(data: unknown) => T` method, which is all this module needs.
 */
type Parser<T> = { parse: (data: unknown) => T };

/** Typed error thrown by non-2xx responses that aren't handled inline. */
export class SyncClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    /**
     * For 429 RATE_LIMITED responses, the integer value of the server's
     * Retry-After header. Callers can use this to schedule a cooldown
     * shared across every sync entry point (alarm, manual button,
     * post-mutate notify) so we don't re-hit the same limit immediately.
     */
    public readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "SyncClientError";
  }
}

interface RequestInitInternal<T> {
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  /**
   * Query string params for GET endpoints. Undefined values are dropped so
   * callers can pass an optional param without conditional construction.
   */
  query?: Record<string, string | number | undefined>;
  parser: Parser<T>;
  /** Set to true for endpoints that must NOT carry the Authorization header. */
  publicEndpoint?: boolean;
}

/**
 * Best-effort broadcast of a lifecycle message to other extension surfaces.
 * sendMessage throws when no listener is registered (e.g. no open views); we
 * swallow that — the broadcast is informational.
 */
function broadcast(type: string): void {
  try {
    const maybePromise = chrome.runtime.sendMessage({ type });
    if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === "function") {
      (maybePromise as Promise<unknown>).catch(() => {});
    }
  } catch {
    // no receivers — ignore
  }
}

/**
 * HTTP client for the sync protocol (spec §2.4.4).
 *
 * Every request carries the protocol-version header so the server's
 * protocol-version middleware can gate on it. Extension binary version is
 * intentionally NOT sent — Chrome Web Store auto-update is the binary
 * update channel; the server doesn't gate on it. 401 responses clear local
 * auth and broadcast SYNC_AUTH_REQUIRED; 426 broadcasts
 * SYNC_PROTOCOL_MISMATCH; other non-2xx codes surface as `SyncClientError`.
 */
export class SyncClient {
  constructor(
    private readonly host: string,
    private readonly token: string,
  ) {}

  async health(): Promise<HealthResponse> {
    return this.request({
      path: "/api/health",
      method: "GET",
      parser: healthResponseSchema,
      publicEndpoint: true,
    });
  }

  async consumeExchange(req: ExchangeConsumeRequest): Promise<ExchangeConsumeResponse> {
    // Validate the outgoing body locally too — a bad deviceId here would 400
    // with an obscure server-side message otherwise.
    const body = exchangeConsumeRequestSchema.parse(req);
    return this.request({
      path: "/api/extension/exchange/consume",
      method: "POST",
      body,
      parser: exchangeConsumeResponseSchema,
      publicEndpoint: true,
    });
  }

  async push(ops: PushOp[]): Promise<PushResponse> {
    // NB: no `deviceId` in the body — the server derives it from the bearer.
    return this.request({
      path: "/api/sync/push",
      method: "POST",
      body: { ops },
      parser: pushResponseSchema,
    });
  }

  async pull(cursor: number, limit?: number): Promise<PullResponse> {
    // GET (not POST) — the server route is a `loader`, which only handles
    // GET in React Router 7. Posting a body 405's silently inside sync()'s
    // try/catch and breaks every authenticated extension.
    return this.request({
      path: "/api/sync/pull",
      method: "GET",
      query: { cursor, limit },
      parser: pullResponseSchema,
    });
  }

  async snapshot(): Promise<SnapshotResponse> {
    return this.request({
      path: "/api/sync/snapshot",
      method: "GET",
      parser: snapshotResponseSchema,
    });
  }

  private buildHeaders(hasBody: boolean, publicEndpoint: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      "x-opentab-protocol-version": PROTOCOL_VERSION,
    };
    if (hasBody) headers["content-type"] = "application/json";
    if (!publicEndpoint) headers.authorization = `Bearer ${this.token}`;
    return headers;
  }

  private async request<T>(init: RequestInitInternal<T>): Promise<T> {
    const hasBody = init.body !== undefined;
    const headers = this.buildHeaders(hasBody, init.publicEndpoint === true);

    const url = `${this.host}${init.path}${buildQueryString(init.query)}`;
    const response = await fetch(url, {
      method: init.method,
      headers,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });

    if (response.status === 401) {
      await setSyncSettings({ auth: null });
      broadcast(MSG.SYNC_AUTH_REQUIRED);
      const { code, message } = await readErrorCode(response, SyncErrorCode.UNAUTHORIZED);
      throw new SyncClientError(code, 401, message);
    }

    if (response.status === 426) {
      broadcast(MSG.SYNC_PROTOCOL_MISMATCH);
      const { code, message } = await readErrorCode(response, SyncErrorCode.API_VERSION_MISMATCH);
      throw new SyncClientError(code, 426, message);
    }

    if (response.status === 429) {
      const { code, message } = await readErrorCode(response, SyncErrorCode.RATE_LIMITED);
      const retryHeader = response.headers.get("retry-after");
      const retryAfterSec = retryHeader == null ? undefined : Number.parseInt(retryHeader, 10);
      throw new SyncClientError(
        code,
        429,
        message,
        Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
      );
    }

    if (!response.ok) {
      const { code, message } = await readErrorCode(response, SyncErrorCode.INTERNAL);
      throw new SyncClientError(code, response.status, message);
    }

    const json = (await response.json()) as unknown;
    return init.parser.parse(json);
  }
}

/**
 * Build a `?k=v&k=v` suffix from a sparse param map; undefined values are
 * skipped so callers can pass optional params without pre-filtering.
 */
function buildQueryString(query: Record<string, string | number | undefined> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s.length === 0 ? "" : `?${s}`;
}

/**
 * Pull `code` + `message` out of an error response body if present, falling
 * back to a sensible default when the server response isn't JSON-shaped as
 * expected (e.g. a bare HTTP text body from a misbehaving proxy).
 */
async function readErrorCode(
  response: Response,
  fallbackCode: string,
): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    const code = typeof body.code === "string" ? body.code : fallbackCode;
    const message =
      typeof body.message === "string"
        ? body.message
        : `HTTP ${response.status} ${response.statusText}`;
    return { code, message };
  } catch {
    return {
      code: fallbackCode,
      message: `HTTP ${response.status} ${response.statusText}`,
    };
  }
}

/**
 * Convenience: build a `SyncClient` from a sync-settings snapshot. Returns
 * `null` when sync is toggled off, no host has been saved, or the user
 * hasn't completed the exchange flow yet.
 */
export function createSyncClientFromState(settings: SyncSettings): SyncClient | null {
  const host = settings.savedConfig?.host;
  const token = settings.auth?.deviceToken;
  if (!settings.enabled || !host || !token) return null;
  return new SyncClient(host, token);
}
