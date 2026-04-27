import { useEffect, useState } from "react";
import { getSyncSettings, SYNC_SETTINGS_STORAGE_KEY, type SyncSettings } from "./sync-settings";

const DEFAULTS: SyncSettings = {
  enabled: false,
  savedConfig: null,
  auth: null,
  hostHistory: [],
};

/**
 * React hook wrapping `getSyncSettings` with live updates.
 *
 * Subscribes to `chrome.storage.onChanged` so the UI re-renders immediately
 * after the wizard, toggle, or disconnect dialog mutates the row. Returns the
 * conservative "disabled, never configured" defaults while the initial read is
 * in flight, matching the old `useSyncAuthState` shape.
 */
export function useSyncSettings(): SyncSettings {
  const [state, setState] = useState<SyncSettings>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    getSyncSettings()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {});

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ) => {
      if (area !== "local") return;
      if (!(SYNC_SETTINGS_STORAGE_KEY in changes)) return;
      getSyncSettings()
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
