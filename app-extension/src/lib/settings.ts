import { db } from "./db";

export interface AppSettings {
  server_enabled: boolean;
  server_url: string;
}

const DEFAULTS: AppSettings = {
  server_enabled: false,
  server_url: "http://localhost:3001",
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.bulkGet(["server_enabled", "server_url"]);
  return {
    server_enabled: rows[0] ? JSON.parse(rows[0].value) : DEFAULTS.server_enabled,
    server_url: rows[1] ? rows[1].value : DEFAULTS.server_url,
  };
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<void> {
  const entries: { key: string; value: string }[] = [];
  if (partial.server_enabled !== undefined) {
    entries.push({ key: "server_enabled", value: JSON.stringify(partial.server_enabled) });
  }
  if (partial.server_url !== undefined) {
    entries.push({ key: "server_url", value: partial.server_url });
  }
  await db.settings.bulkPut(entries);
}
