import { attemptRegistration, initializeAuth } from "@/lib/auth-manager";
import { getAuthState, setAuthState } from "@/lib/auth-storage";
import { MSG } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import { SyncEngine } from "@/lib/sync-engine";

const AUTH_RETRY_ALARM = "opentab-auth-retry";

async function setOfflineMode(): Promise<void> {
  const existing = await getAuthState();
  await setAuthState({
    mode: "offline",
    localUuid: existing?.localUuid ?? crypto.randomUUID(),
  });
}

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started");

  // --- Sync engine ---
  const SYNC_POLL_ALARM = "sync-poll";
  const syncEngine = new SyncEngine();

  async function ensureSyncAlarm(): Promise<void> {
    const settings = await getSettings();
    if (settings.server_enabled) {
      const existing = await browser.alarms.get(SYNC_POLL_ALARM);
      if (!existing) {
        await browser.alarms.create(SYNC_POLL_ALARM, {
          periodInMinutes: Math.max(1, settings.sync_polling_interval / 60_000),
        });
        console.log("[bg] sync-poll alarm created");
      }
    } else {
      await browser.alarms.clear(SYNC_POLL_ALARM);
    }
  }

  // Ensure sync alarm on startup
  ensureSyncAlarm().catch((err) => console.error("[bg] ensureSyncAlarm error:", err));

  browser.runtime.onInstalled.addListener(async (details) => {
    const settings = await getSettings();
    console.log("[bg] server_enabled:", settings.server_enabled);

    if (settings.server_enabled) {
      console.log("[bg] server enabled — initializing auth");
      const state = await initializeAuth(settings.server_url);

      if (details.reason === "install" && state.mode === "offline") {
        await browser.alarms.create(AUTH_RETRY_ALARM, {
          periodInMinutes: 1,
        });
        console.log("[bg] offline mode — retry alarm created");
      }
    } else {
      console.log("[bg] server disabled — clearing retry alarm and setting offline mode");
      await browser.alarms.clear(AUTH_RETRY_ALARM);
      await setOfflineMode();
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === AUTH_RETRY_ALARM) {
      console.log("[bg] auth retry alarm fired");
      const settings = await getSettings();

      if (!settings.server_enabled) {
        await browser.alarms.clear(AUTH_RETRY_ALARM);
        console.log("[bg] server disabled — clearing retry alarm");
        return;
      }

      const state = await attemptRegistration(settings.server_url);

      if (state?.mode === "online") {
        await browser.alarms.clear(AUTH_RETRY_ALARM);
        console.log("[bg] now online — retry alarm cleared");
      }
    } else if (alarm.name === SYNC_POLL_ALARM) {
      console.log("[bg] sync-poll alarm fired");
      try {
        await syncEngine.sync();
        await syncEngine.retryFailed();
        await syncEngine.cleanupOutbox();
      } catch (err) {
        console.error("[bg] sync-poll error:", err);
      }
    }
  });

  // --- Message listeners ---
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG.SETTINGS_CHANGED) {
      (async () => {
        const settings = await getSettings();
        console.log("[bg] settings changed, server_enabled:", settings.server_enabled);

        if (settings.server_enabled) {
          const state = await initializeAuth(settings.server_url);
          if (state.mode === "offline") {
            await browser.alarms.create(AUTH_RETRY_ALARM, {
              periodInMinutes: 1,
            });
            console.log("[bg] offline after enable — retry alarm created");
          }
        } else {
          await setOfflineMode();
          await browser.alarms.clear(AUTH_RETRY_ALARM);
          console.log("[bg] server disabled — set offline, cleared alarm");
        }
      })();
    } else if (message.type === MSG.SYNC_REQUEST) {
      syncEngine.syncIfNeeded().catch((err) => {
        console.error("[bg] SYNC_REQUEST error:", err);
      });
    } else if (message.type === MSG.SYNC_INTERVAL_CHANGED) {
      (async () => {
        await browser.alarms.clear(SYNC_POLL_ALARM);
        await ensureSyncAlarm();
        console.log("[bg] sync-poll alarm recreated after interval change");
      })().catch((err) => console.error("[bg] SYNC_INTERVAL_CHANGED error:", err));
    }
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
