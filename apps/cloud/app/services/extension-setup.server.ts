/**
 * Extension setup exchange service — creates and consumes the single-use
 * code that bridges the authenticated browser tab and the extension's
 * deviceToken-based auth.
 *
 * Two entrypoints:
 *   - `createExchange`  — called from `/connect/extension`'s cookie-authed
 *                         action. Validates the callback URL origin against
 *                         the extension allowlist, mints a one-time code,
 *                         and persists the exchange row.
 *   - `consumeExchange` — public POST `/api/extension/exchange/consume`
 *                         handler. Atomically marks the row consumed,
 *                         rotates / creates the device row, returns the
 *                         new deviceToken + user info.
 *
 * Errors thrown here are `Response` instances shaped by `syncError` so the
 * route can rethrow them as-is.
 */

import {
  type ExchangeConsumeRequest,
  type ExchangeConsumeResponse,
  SyncErrorCode,
} from "@opentab/protocol";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { users } from "~/drizzle/schema";
import { type AllowlistEnv, isAllowedCallback } from "~/lib/allowlist-origins";
import { syncError } from "~/lib/sync-errors";
import { db as defaultDb } from "~/services/db.server";
import {
  consumeExchangeByCodeHash,
  insertExchange,
  upsertDeviceByIdRotatingToken,
} from "~/services/extension-setup-repo.server";
import type { Db } from "~/services/sync-repo.server";

// 10-minute TTL for exchange codes. Short enough to limit phishing exposure,
// long enough for a user to notice the approve click and the extension to
// pick up the redirect.
const EXCHANGE_TTL_MS = 10 * 60 * 1000;

// 32 bytes of entropy rendered as base64url — 256-bit device tokens.
const DEVICE_TOKEN_BYTES = 32;

export type CreateExchangeInput = {
  nonce: string;
  callbackUrl: string;
  deviceName: string;
  platform: string;
  extensionVersion: string;
};

export type CreateExchangeCtx = {
  userId: string;
  db?: Db;
  // `now` is injectable so tests can assert on expiresAt without fake timers.
  now?: () => number;
};

export type ConsumeExchangeCtx = {
  db?: Db;
  now?: () => number;
};

function resolveDb(ctx: { db?: Db }): Db {
  return ctx.db ?? (defaultDb as unknown as Db);
}

function resolveNow(ctx: { now?: () => number }): number {
  return (ctx.now ?? Date.now)();
}

// ---------------------------------------------------------------------------
// SHA-256 helper (WebCrypto — available in Workers + Node >= 20)
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  // btoa expects a latin1 string; build it byte-wise so values >127 aren't
  // mangled. Then swap the URL-unsafe characters to the base64url alphabet.
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// createExchange
// ---------------------------------------------------------------------------

/**
 * Produce a one-time exchange code and a redirect URL the approve-page
 * should `Location` into. Called inside the `/connect/extension` action —
 * caller is cookie-authenticated.
 *
 * Errors thrown:
 *   - 400 INVALID_PAYLOAD — `callbackUrl` origin is not on the extension
 *                           allowlist, or the URL is structurally invalid.
 */
export async function createExchange(
  ctx: CreateExchangeCtx,
  input: CreateExchangeInput,
  env: AllowlistEnv,
): Promise<{ exchangeCode: string; redirectUrl: string }> {
  let parsed: URL;
  try {
    parsed = new URL(input.callbackUrl);
  } catch {
    throw syncError(SyncErrorCode.INVALID_PAYLOAD, 400, "invalid callback_url");
  }
  // Node's WHATWG URL reports `origin === "null"` for non-special schemes
  // like `chrome-extension:`, so synthesize the origin from protocol + host
  // instead of trusting `parsed.origin`.
  const callbackOrigin = `${parsed.protocol}//${parsed.host}`;
  if (!isAllowedCallback(callbackOrigin, env)) {
    throw syncError(SyncErrorCode.INVALID_PAYLOAD, 400, "callback origin not allowed");
  }

  const exchangeCode = uuidv7();
  const codeHash = await sha256Hex(exchangeCode);
  const now = resolveNow(ctx);

  await insertExchange(resolveDb(ctx), {
    id: uuidv7(),
    codeHash,
    userId: ctx.userId,
    nonce: input.nonce,
    callbackUrl: input.callbackUrl,
    deviceName: input.deviceName,
    platform: input.platform,
    extensionVersion: input.extensionVersion,
    expiresAt: new Date(now + EXCHANGE_TTL_MS),
    createdAt: new Date(now),
  });

  // Use URL() to compose query params safely — input.callbackUrl may already
  // carry a `?` or fragment, and we need URL-encoded values for nonce too.
  const redirect = new URL(input.callbackUrl);
  redirect.searchParams.set("exchange_code", exchangeCode);
  redirect.searchParams.set("nonce", input.nonce);
  return { exchangeCode, redirectUrl: redirect.toString() };
}

// ---------------------------------------------------------------------------
// consumeExchange
// ---------------------------------------------------------------------------

/**
 * Exchange a single-use code for a long-lived deviceToken. Expected to be
 * called by the extension over the public `/api/extension/exchange/consume`
 * endpoint. Returns the newly-minted token + the authenticated user's
 * profile so the extension can greet them without a second round-trip.
 *
 * Errors thrown:
 *   - 409 EXCHANGE_INVALID — code hash unknown, already consumed, expired,
 *                            or nonce mismatch.
 *   - 500 INTERNAL         — user lookup failed (shouldn't happen in
 *                            practice because the exchange row can only be
 *                            written for an existing user).
 */
export async function consumeExchange(
  ctx: ConsumeExchangeCtx,
  input: ExchangeConsumeRequest,
): Promise<ExchangeConsumeResponse> {
  const db = resolveDb(ctx);
  const now = resolveNow(ctx);

  const codeHash = await sha256Hex(input.exchangeCode);
  const exchange = await consumeExchangeByCodeHash(db, codeHash, now);
  if (!exchange) {
    throw syncError(SyncErrorCode.EXCHANGE_INVALID, 409, "exchange code invalid or consumed");
  }
  if (exchange.nonce !== input.nonce) {
    // Nonce mismatch is the client's fault, but we still 409 to avoid leaking
    // which axis (code vs nonce) the attacker got wrong.
    throw syncError(SyncErrorCode.EXCHANGE_INVALID, 409, "nonce mismatch");
  }

  // Mint + hash the device token. The plaintext leaves this function once
  // (in the response) and is never stored server-side.
  const deviceToken = randomBase64Url(DEVICE_TOKEN_BYTES);
  const tokenHash = await sha256Hex(deviceToken);

  await upsertDeviceByIdRotatingToken(db, {
    id: input.deviceId,
    userId: exchange.userId,
    name: input.deviceName,
    platform: input.platform,
    extensionVersion: input.extensionVersion,
    tokenHash,
    createdAt: new Date(now),
    lastSeenAt: new Date(now),
  });

  const userRows = await db.select().from(users).where(eq(users.id, exchange.userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    throw syncError(SyncErrorCode.INTERNAL, 500, "exchange owner not found");
  }

  return {
    deviceId: input.deviceId,
    deviceToken,
    deviceName: input.deviceName,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
}
