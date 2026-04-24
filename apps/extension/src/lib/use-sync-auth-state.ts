import { useEffect, useState } from "react";
import { getSyncAuth, type SyncAuthState } from "./sync-auth-storage";

const STORAGE_KEY = "opentab_sync_auth_v1";

/**
 * React hook wrapping `getSyncAuth` with live updates.
 *
 * Subscribes to `chrome.storage.onChanged` so the UI re-renders immediately
 * after the wizard writes `authenticated` or the disconnect dialog clears the
 * key. Returns a conservative `disabled` fallback while the initial read is
 * in flight.
 */
export function useSyncAuthState(): SyncAuthState {
  const [state, setState] = useState<SyncAuthState>({ kind: "disabled" });

  useEffect(() => {
    let cancelled = false;
    getSyncAuth()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {});

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ) => {
      if (area !== "local") return;
      if (!(STORAGE_KEY in changes)) return;
      getSyncAuth()
        .then((s) => setState(s))
        .catch(() => {});
    };
    chrome.storage.onChanged.addListener(listener);

    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  return state;
}
