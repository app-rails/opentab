// Pure module shared between the setup-callback entry script and the wizard
// hook. Lives outside `entrypoints/setup-callback/main.ts` because that file
// has top-level side effects (registers a DOMContentLoaded listener and
// auto-closes the tab 1.5s after init). Any value-import from main.ts pulls
// those side effects into whatever bundle imports it — the wizard chunk
// then auto-closed the *settings* tab on load. Keep constants and pure
// helpers here; main.ts re-imports them and owns the side effects alone.

export const PENDING_CALLBACK_STORAGE_KEY = "opentab_pending_setup_callback_v1";

export interface SetupCallbackPayload {
  exchangeCode: string | null;
  nonce: string | null;
  error: string | null;
  receivedAt: number;
}

export function parseCallbackParams(search: string): Omit<SetupCallbackPayload, "receivedAt"> {
  const params = new URLSearchParams(search);
  return {
    exchangeCode: params.get("exchange_code"),
    nonce: params.get("nonce"),
    error: params.get("error"),
  };
}
