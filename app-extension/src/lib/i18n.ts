import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import zh from "@/locales/zh.json";
import type { Locale } from "./settings";
import { getSettings, saveSettings } from "./settings";

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
 * Returns a promise that resolves when i18n language is set.
 */
export async function initLocale(): Promise<void> {
  const settings = await getSettings();
  let locale = settings.locale;
  // First launch: DEFAULTS is static "en", detect from browser
  if (locale === "en" && !(await hasPersistedLocale())) {
    locale = detectLocale();
    if (locale !== "en") {
      await saveSettings({ locale });
    }
  }
  await i18n.changeLanguage(locale);
}

/** Check if locale has been explicitly saved (vs just using DEFAULTS). */
async function hasPersistedLocale(): Promise<boolean> {
  const { db } = await import("./db");
  const row = await db.settings.get("locale");
  return row != null;
}

export default i18n;
