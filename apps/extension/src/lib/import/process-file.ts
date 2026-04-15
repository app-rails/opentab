import type { TFunction } from "i18next";
import { db } from "@/lib/db";
import { detectFormat } from "./detect";
import { parseOpenTab } from "./parse-opentab";
import { parseTabTab } from "./parse-tabtab";

/**
 * Parses an import file, stores the session, and opens the import review page.
 * Shared between the sidebar import button and the settings import panel.
 */
export async function processImportFile(file: File, t: TFunction): Promise<void> {
  const text = await file.text();
  const json = JSON.parse(text);
  const format = detectFormat(json);

  if (!format) {
    alert(t("settings.import.unsupported_format"));
    return;
  }

  const importData = format === "tabtab" ? parseTabTab(json) : parseOpenTab(json);

  const sessionId = await db.importSessions.add({
    data: JSON.stringify(importData),
    createdAt: Date.now(),
  });

  chrome.tabs.create({
    url: chrome.runtime.getURL(`/import.html?sessionId=${sessionId}`),
  });
}
