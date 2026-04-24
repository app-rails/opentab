import {
  type ExchangeConsumeRequest,
  type ExchangeConsumeResponse,
  exchangeConsumeResponseSchema,
} from "@opentab/protocol";

/**
 * Authorization tab + exchange-consume helpers (spec §2.4.5).
 *
 * Splits the two side-effectful steps of the handshake so tests can mock
 * them independently:
 *   - `openAuthorizationTab` creates the `/connect/extension?...` popup.
 *   - `consumeExchangeCode` POSTs to `/api/extension/exchange/consume`.
 * The setup-callback bridge (entrypoints/setup-callback) owns the delivery
 * of `exchangeCode` back into the wizard via runtime message + storage.
 */

export interface OpenAuthorizationArgs {
  host: string;
  nonce: string;
  deviceName: string;
  platform: string;
  extensionVersion: string;
}

export async function openAuthorizationTab(args: OpenAuthorizationArgs): Promise<number> {
  const callbackUrl = chrome.runtime.getURL("/setup-callback.html");
  const params = new URLSearchParams({
    nonce: args.nonce,
    callback_url: callbackUrl,
    device_name: args.deviceName,
    platform: args.platform,
    extension_version: args.extensionVersion,
  });
  const url = `${args.host}/connect/extension?${params.toString()}`;
  const tab = await chrome.tabs.create({ url, active: true });
  if (typeof tab.id !== "number") {
    throw new Error("chrome.tabs.create did not return a tab id");
  }
  return tab.id;
}

export interface ConsumeExchangeArgs extends ExchangeConsumeRequest {
  host: string;
}

export async function consumeExchangeCode(
  args: ConsumeExchangeArgs,
): Promise<ExchangeConsumeResponse> {
  const { host, ...body } = args;
  const response = await fetch(`${host}/api/extension/exchange/consume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const msg =
      json && typeof json === "object" && "message" in json
        ? String((json as Record<string, unknown>).message)
        : `HTTP ${response.status}`;
    throw new Error(msg);
  }

  const parsed = exchangeConsumeResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Invalid exchange response: ${parsed.error.message}`);
  }
  return parsed.data;
}
