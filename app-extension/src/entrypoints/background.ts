import { attemptRegistration, initializeAuth } from "@/lib/auth-manager";
import { getAuthState, setAuthState } from "@/lib/auth-storage";
import { MSG } from "@/lib/constants";
import { seedDefaultData } from "@/lib/db-init";
import { getSettings } from "@/lib/settings";

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

    try {
      console.log("[bg] ensuring default database data exists");
      await seedDefaultData();
    } catch (error) {
      console.error("[bg] failed to seed default data:", error);
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== AUTH_RETRY_ALARM) return;

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
  });

  // --- Settings change listener ---
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== MSG.SETTINGS_CHANGED) return;

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
