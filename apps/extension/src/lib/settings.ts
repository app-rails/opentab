import { MSG } from "./constants";
import { db } from "./db";

export type Locale = "en" | "zh";

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  server_enabled: boolean;
  server_url: string;
  theme: ThemeMode;
  locale: Locale;
  welcome_dismissed: boolean;
  sidebar_collapsed: boolean;
  right_panel_collapsed: boolean;
  sync_polling_interval: number;
}

const DEFAULTS: AppSettings = {
  server_enabled: false,
  server_url: "http://localhost:3001",
  theme: "system",
  locale: "en",
  welcome_dismissed: false,
  sidebar_collapsed: false,
  right_panel_collapsed: false,
  sync_polling_interval: 600_000, // 10 minutes, clamped [60_000, 3_600_000]
};

const KEYS = Object.keys(DEFAULTS) as (keyof AppSettings)[];

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.bulkGet(KEYS);
  const result = { ...DEFAULTS };
  for (let i = 0; i < KEYS.length; i++) {
    const row = rows[i];
    if (row) {
      try {
        (result as Record<string, unknown>)[KEYS[i]] = JSON.parse(row.value);
      } catch {
        // Legacy value stored as plain string — coerce booleans, keep strings
        const v = row.value;
        (result as Record<string, unknown>)[KEYS[i]] =
          v === "true" ? true : v === "false" ? false : v;
      }
    }
  }
  return result;
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<void> {
  const entries: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      entries.push({ key, value: JSON.stringify(value) });
    }
  }
  if (entries.length > 0) {
    await db.settings.bulkPut(entries);
  }
}

/** Update settings and broadcast SETTINGS_CHANGED to all extension tabs. */
export async function saveSettings(partial: Partial<AppSettings>): Promise<void> {
  await updateSettings(partial);
  chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
}
