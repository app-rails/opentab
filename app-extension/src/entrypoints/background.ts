import { attemptRegistration, initializeAuth } from "@/lib/auth-manager";
import { seedDefaultData } from "@/lib/db-init";

const AUTH_RETRY_ALARM = "opentab-auth-retry";

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started");

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      console.log("[bg] first install detected, initializing auth");
      const state = await initializeAuth();

      if (state.mode === "offline") {
        await browser.alarms.create(AUTH_RETRY_ALARM, {
          periodInMinutes: 1,
        });
        console.log("[bg] offline mode — retry alarm created");
      }
    }

    // Seed on both install and update (M2→M3 upgrade path).
    // seedDefaultData() is idempotent — skips if data already exists.
    console.log("[bg] ensuring default database data exists");
    await seedDefaultData();
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== AUTH_RETRY_ALARM) return;

    console.log("[bg] auth retry alarm fired");
    const state = await attemptRegistration();

    if (state?.mode === "online") {
      await browser.alarms.clear(AUTH_RETRY_ALARM);
      console.log("[bg] now online — retry alarm cleared");
    }
  });
});
