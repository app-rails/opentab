import { attemptRegistration, initializeAuth } from "@/lib/auth-manager";
import { getAuthState } from "@/lib/auth-storage";

const AUTH_RETRY_ALARM = "opentab-auth-retry";

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started");

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      console.log("[bg] first install detected, initializing auth");
      await initializeAuth();

      const state = await getAuthState();
      if (state?.mode === "offline") {
        await browser.alarms.create(AUTH_RETRY_ALARM, {
          periodInMinutes: 1,
        });
        console.log("[bg] offline mode — retry alarm created");
      }
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== AUTH_RETRY_ALARM) return;

    console.log("[bg] auth retry alarm fired");
    await attemptRegistration();

    const state = await getAuthState();
    if (state?.mode === "online") {
      await browser.alarms.clear(AUTH_RETRY_ALARM);
      console.log("[bg] now online — retry alarm cleared");
    }
  });
});
