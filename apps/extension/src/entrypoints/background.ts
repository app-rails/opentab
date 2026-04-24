import { initializeAuth } from "@/lib/auth-manager";
import { MSG } from "@/lib/constants";

// Phase 0: server sync is disabled. The sync engine, auth-retry alarm, and
// sync-poll alarm are all dormant until Phase 1 restores the transport. The
// SyncEngine class in src/lib/sync-engine.ts still compiles (tests import it
// and Phase 1 will rewire it) but is never instantiated here.
const SYNC_POLL_ALARM = "sync-poll";
const AUTH_RETRY_ALARM = "opentab-auth-retry";

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started (sync disabled)");

  // --- Ensure offline auth state on startup ---
  // initializeAuth synthesises and persists an offline AuthState (local UUID
  // only). Keeps chrome.storage.local.opentab_auth populated for callers that
  // still read it.
  initializeAuth().catch((err) => console.error("[bg] initializeAuth error:", err));

  // --- Clear any zombie alarms left over from previous installs ---
  // Users upgrading from a build that scheduled sync-poll or auth-retry
  // alarms should not continue receiving those events while sync is dormant.
  browser.runtime.onInstalled.addListener(async () => {
    await Promise.all([
      browser.alarms.clear(SYNC_POLL_ALARM),
      browser.alarms.clear(AUTH_RETRY_ALARM),
    ]);
    console.log("[bg] cleared legacy sync/auth alarms on install/update");
  });

  // Defensive: clear alarms on every startup as well so a long-lived dev
  // profile that has already passed onInstalled is not stuck with a zombie.
  Promise.all([
    browser.alarms.clear(SYNC_POLL_ALARM),
    browser.alarms.clear(AUTH_RETRY_ALARM),
  ]).catch((err) => console.error("[bg] alarm cleanup error:", err));

  // --- Message listeners ---
  // SETTINGS_CHANGED / SYNC_REQUEST / SYNC_INTERVAL_CHANGED are intentionally
  // no-ops in Phase 0. The settings UI still sends SETTINGS_CHANGED when the
  // (disabled) toggle is flipped programmatically, and the outbox still emits
  // SYNC_REQUEST on every mutation; both should be silently ignored here
  // until Phase 1 restores the sync engine.
  chrome.runtime.onMessage.addListener((_message) => {
    // No sync-related message handlers in Phase 0.
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
