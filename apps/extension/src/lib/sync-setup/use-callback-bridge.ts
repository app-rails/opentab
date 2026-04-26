import { useEffect, useRef } from "react";
import { MSG } from "@/lib/constants";
import {
  PENDING_CALLBACK_STORAGE_KEY,
  type SetupCallbackPayload,
} from "@/lib/sync-setup/setup-callback-shared";

/**
 * Bridge between the `/setup-callback` page and the wizard UI (spec §2.4.5a).
 *
 * The callback entrypoint writes two things when authorization returns:
 *   1. A durable record to `chrome.storage.local[opentab_pending_setup_callback_v1]`
 *      (slow path — survives the settings page being closed at callback time).
 *   2. A `chrome.runtime.sendMessage({ type: SYNC_SETUP_CALLBACK, payload })`
 *      (fast path — delivered instantly to open listeners).
 *
 * This hook subscribes to both. On mount it also sweeps storage once so a
 * "settings was closed when callback fired, then user reopens it" flow still
 * delivers the code. Stale records (> 10 min) are discarded to avoid
 * replaying a half-finished wizard from a prior day.
 */

const STALE_AFTER_MS = 10 * 60 * 1000;

export function useSetupCallbackBridge(onCallback: (payload: SetupCallbackPayload) => void): void {
  const delivered = useRef<Set<string>>(new Set());

  useEffect(() => {
    const deliverOnce = (payload: SetupCallbackPayload): void => {
      const key = `${payload.exchangeCode ?? ""}|${payload.nonce ?? ""}|${payload.receivedAt}`;
      if (delivered.current.has(key)) return;
      delivered.current.add(key);
      onCallback(payload);
    };

    // Fast path: runtime message from the setup-callback tab.
    const onMsg = (msg: unknown): void => {
      if (!msg || typeof msg !== "object") return;
      const m = msg as { type?: unknown; payload?: unknown };
      if (m.type !== MSG.SYNC_SETUP_CALLBACK) return;
      const payload = m.payload as SetupCallbackPayload | undefined;
      if (!payload) return;
      // Clear the durable record so a later mount's sweep doesn't replay.
      chrome.storage.local.remove(PENDING_CALLBACK_STORAGE_KEY).catch(() => {});
      deliverOnce(payload);
    };
    chrome.runtime.onMessage.addListener(onMsg);

    // Slow path: sweep on mount (settings was closed when callback fired).
    chrome.storage.local
      .get(PENDING_CALLBACK_STORAGE_KEY)
      .then((got) => {
        const pending = (got as Record<string, unknown>)[PENDING_CALLBACK_STORAGE_KEY] as
          | SetupCallbackPayload
          | undefined;
        if (!pending) return;
        // Remove eagerly so any concurrent onMessage doesn't double-deliver.
        chrome.storage.local.remove(PENDING_CALLBACK_STORAGE_KEY).catch(() => {});
        if (
          typeof pending.receivedAt !== "number" ||
          Date.now() - pending.receivedAt > STALE_AFTER_MS
        ) {
          return;
        }
        deliverOnce(pending);
      })
      .catch(() => {});

    return () => {
      chrome.runtime.onMessage.removeListener(onMsg);
    };
  }, [onCallback]);
}
