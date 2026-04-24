import type { SyncErrorCode } from "@opentab/protocol";

/**
 * Build a JSON `Response` for a terminal sync error. The body shape matches
 * what the extension's sync client expects to narrow on `error.code`.
 *
 * Intended to be `throw`n from loaders/actions/middleware so the response
 * bubbles up unchanged (React Router re-throws `Response` instances as-is).
 */
export function syncError(code: SyncErrorCode, status: number, message?: string): Response {
  return new Response(JSON.stringify({ error: { code, message: message ?? code } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
