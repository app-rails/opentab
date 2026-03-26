import { attemptRegistration, initializeAuth } from "@/lib/auth-manager";
import { seedDefaultData } from "@/lib/db-init";

const AUTH_RETRY_ALARM = "opentab-auth-retry";

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started");

  browser.runtime.onInstalled.addListener(async (details) => {
    // Initialize auth on both install and update so seedDefaultData always has a valid account.
    console.log("[bg] ensuring auth is initialized");
    const state = await initializeAuth();

    if (details.reason === "install" && state.mode === "offline") {
      await browser.alarms.create(AUTH_RETRY_ALARM, {
        periodInMinutes: 1,
      });
      console.log("[bg] offline mode — retry alarm created");
    }

    // Seed on both install and update (M2→M3 upgrade path).
    // seedDefaultData() is idempotent — skips if data already exists.
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
    const state = await attemptRegistration();

    if (state?.mode === "online") {
      await browser.alarms.clear(AUTH_RETRY_ALARM);
      console.log("[bg] now online — retry alarm cleared");
    }
  });
});
