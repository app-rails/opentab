import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import zh from "@/locales/zh.json";
import type { Locale } from "./settings";
import { saveSettings } from "./settings";

/** Detect browser language, falling back to "en". Only call in page contexts. */
function detectLocale(): Locale {
  return navigator.language?.startsWith("zh") ? "zh" : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

/**
 * Read persisted locale from settings and apply it. If no locale has been
 * persisted yet (first launch), detect from browser language and save it.
 * Single DB read — checks the raw row to avoid a second query.
 */
export async function initLocale(): Promise<void> {
  const { db } = await import("./db");
  const row = await db.settings.get("locale");
  let locale: Locale;
  if (row) {
    locale = JSON.parse(row.value) as Locale;
  } else {
    // First launch: no persisted locale, detect from browser
    locale = detectLocale();
    if (locale !== "en") {
      await saveSettings({ locale });
    }
  }
  await i18n.changeLanguage(locale);
}

export default i18n;
