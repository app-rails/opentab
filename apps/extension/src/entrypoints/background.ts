import { initializeAuth } from "@/lib/auth-manager";
import { MSG } from "@/lib/constants";
import { createSyncEngine, type SyncEngine } from "@/lib/sync-engine";
import { getSyncSettings, SYNC_SETTINGS_STORAGE_KEY } from "@/lib/sync-settings";

/**
 * Background service worker (spec §2.4.6).
 *
 * Responsibilities:
 *   - Maintain the offline auth record.
 *   - Own the sync alarm / engine lifecycle — started when
 *     `opentab_sync_settings_v1.enabled` is true and `auth` is populated;
 *     torn down on disconnect / toggle off / auth clear.
 *   - Broadcast live-tab changes.
 *   - Focus or open the dashboard tab on action click.
 *
 * Legacy note: Task 5 temporarily disabled all sync paths for Phase 0; this
 * task re-enables them gated on the sync-settings state.
 */
const SYNC_POLL_ALARM = "sync-poll";
const AUTH_RETRY_ALARM = "opentab-auth-retry";
const SYNC_POLL_INTERVAL_MINUTES = 10;

let syncEngine: SyncEngine | null = null;

async function ensureSyncEngine(): Promise<void> {
  const settings = await getSyncSettings();
  if (!settings.enabled || !settings.auth) {
    syncEngine = null;
    await browser.alarms.clear(SYNC_POLL_ALARM).catch(() => {});
    console.log(
      "[bg] sync disabled (enabled=%s, hasAuth=%s)",
      settings.enabled,
      settings.auth != null,
    );
    return;
  }

  try {
    syncEngine = createSyncEngine(settings);
  } catch (err) {
    console.error("[bg] createSyncEngine failed:", err);
    syncEngine = null;
    return;
  }

  if (!syncEngine) {
    // createSyncEngine consumes the same settings snapshot we just read; a
    // null result means the snapshot lacked host or auth — fall back to
    // disabled.
    await browser.alarms.clear(SYNC_POLL_ALARM).catch(() => {});
    return;
  }

  // (Re-)create the polling alarm.
  await browser.alarms.clear(SYNC_POLL_ALARM).catch(() => {});
  await browser.alarms.create(SYNC_POLL_ALARM, {
    periodInMinutes: SYNC_POLL_INTERVAL_MINUTES,
  });
  console.log("[bg] sync engine started, poll=%dmin", SYNC_POLL_INTERVAL_MINUTES);
}

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started");

  // --- Ensure offline auth state on startup ---
  initializeAuth().catch((err) => console.error("[bg] initializeAuth error:", err));

  // --- Boot sync engine and clear zombie auth-retry alarm ---
  browser.runtime.onInstalled.addListener(async () => {
    await browser.alarms.clear(AUTH_RETRY_ALARM).catch(() => {});
    await ensureSyncEngine();
  });

  browser.runtime.onStartup.addListener(async () => {
    await ensureSyncEngine();
  });

  // Defensive: also reconcile on worker spin-up (happens on every message in
  // MV3 after idle eviction). `ensureSyncEngine` is cheap when already wired.
  void ensureSyncEngine();

  // --- React to wizard-side auth flips ---
  //
  // The wizard finishes auth by writing chrome.storage.local under
  // SYNC_SETTINGS_STORAGE_KEY (via setSyncSettings). It also dispatches
  // SYNC_SETUP_COMPLETE in `handleComplete`, but that handler only fires
  // when the user clicks the wizard's "Setup complete" Close button — and
  // App.tsx swaps the wizard for SyncStatusCard the moment auth flips, so
  // the user typically never sees that step. Result: bg's ensureSyncEngine
  // would be stuck on the pre-auth `disabled` snapshot until the next worker
  // restart, and the outbox would never drain. Subscribe to storage changes
  // directly so bg auto-wires the moment the wizard authenticates,
  // independent of any UI message.
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") return;
    if (!(SYNC_SETTINGS_STORAGE_KEY in changes)) return;
    await ensureSyncEngine();
    // If auth just flipped to authenticated, kick off a sync immediately so
    // the wizard's bulk-pushed ops drain without waiting up to 10 min for
    // the first alarm tick. Subsequent drains happen on the alarm.
    if (syncEngine) {
      syncEngine.sync().catch((err) => console.error("[bg] auth-flip sync error:", err));
    }
    // Mirror the Settings → toggle into the engine's pause flag. ensureSyncEngine
    // already null-tears the engine on `enabled=false`, but pause()/resume() is
    // a defense-in-depth: if the engine instance is still around (e.g. a future
    // refactor keeps it warm), the toggle still gates network I/O. The flip
    // direction matters — only call resume() on the false→true edge so we
    // don't repeatedly stomp the flag during unrelated settings writes.
    const change = changes[SYNC_SETTINGS_STORAGE_KEY];
    const oldEnabled = (change.oldValue as { enabled?: boolean } | undefined)?.enabled ?? false;
    const newEnabled = (change.newValue as { enabled?: boolean } | undefined)?.enabled ?? false;
    const engine = syncEngine;
    if (engine) {
      if (!newEnabled) engine.pause();
      else if (oldEnabled === false && newEnabled) engine.resume();
    }
  });

  // --- Message listeners ---
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;
    const type = (message as { type?: unknown }).type;
    switch (type) {
      case MSG.SYNC_REQUEST:
        syncEngine?.sync().catch((err) => console.error("[bg] SYNC_REQUEST error:", err));
        break;
      case MSG.SYNC_SETUP_COMPLETE:
        void ensureSyncEngine();
        break;
      case MSG.SYNC_DISCONNECTED:
        void ensureSyncEngine();
        break;
      // SYNC_SETUP_CALLBACK is wizard-scoped (spec §2.4.5a); the background
      // intentionally does not consume it.
      // SYNC_AUTH_REQUIRED is surfaced to the UI, not background.
      default:
        break;
    }
  });

  // --- Sync poll alarm ---
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== SYNC_POLL_ALARM) return;
    const engine = syncEngine;
    if (!engine) return;
    engine.sync().catch((err) => console.error("[bg] sync error:", err));
    engine.retryFailed().catch((err) => console.error("[bg] retryFailed error:", err));
  });

  // --- Extension icon click: open or focus dashboard tab ---
  browser.action.onClicked.addListener(async () => {
    const tabsUrl = browser.runtime.getURL("/tabs.html");
    const existing = await browser.tabs.query({ url: tabsUrl });

    if (existing.length > 0 && existing[0].id != null) {
      await browser.tabs.update(existing[0].id, { active: true });
      if (existing[0].windowId != null) {
        await browser.windows.update(existing[0].windowId, { focused: true });
      }
    } else {
      await browser.tabs.create({ url: tabsUrl });
    }
  });

  // --- Tab event broadcasting for live-tab panel ---
  const RELEVANT_TAB_FIELDS = ["title", "url", "favIconUrl", "status"] as const;

  chrome.tabs.onCreated.addListener((tab) => {
    chrome.runtime.sendMessage({ type: MSG.TAB_CREATED, tab }).catch(() => {});
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.runtime
      .sendMessage({ type: MSG.TAB_REMOVED, tabId, windowId: removeInfo.windowId })
      .catch(() => {});
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!RELEVANT_TAB_FIELDS.some((k) => k in changeInfo)) return;
    chrome.runtime
      .sendMessage({ type: MSG.TAB_UPDATED, tabId: _tabId, changeInfo, tab })
      .catch(() => {});
  });
});
